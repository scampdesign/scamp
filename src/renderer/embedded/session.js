import { EMBEDDED_COMPUTED_PROPERTIES, INSPECTOR_PREFIX, inspectorScript, inspectorTreeScript, mergeRoutes } from '@shared/embedded';
import { flattenRoutes, readRoutesFn } from '@shared/reactRoutes';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { STAND_IN_ID, standInTree, styleChanges } from '@lib/embeddedStandIn';
import { useCanvasStore } from '@store/canvasSlice';
import { useEmbeddedStore } from './embeddedStore';
/**
 * The bridge between the running app, the panel and the agent:
 *
 * - The inspector runs in the page (`installInspector`) and reports a
 *   selection as a console line; it becomes a stand-in element in the
 *   canvas store, which is what Scamp's panel edits.
 * - Each panel edit is read back as CSS (`styleChanges`), applied inline to
 *   the page at once (layer 1), and, after a pause in editing, queued for
 *   the agent (layer 2).
 * see docs/plans/embedded-scamp-plan.md
 */
const SOURCE_ATTR = 'data-scamp-src';
/** How long editing pauses before an edit goes to the agent's queue. */
export const ENQUEUE_DELAY_MS = 900;
let webview = null;
let enqueueTimer = null;
/** True while the stand-in is being loaded, so the load isn't read as an edit. */
let loading = false;
const newId = () => `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const config = { prefix: INSPECTOR_PREFIX, attr: SOURCE_ATTR, properties: [...EMBEDDED_COMPUTED_PROPERTIES] };
export const runInspector = async (cmd) => {
    if (webview === null)
        return;
    try {
        await webview.executeJavaScript(inspectorScript(config, cmd));
    }
    catch {
        // The page is mid-navigation; the next dom-ready installs it again.
    }
};
/** Install the inspector in a freshly loaded page, with the window's current modes. */
export const installInPage = async () => {
    const { edit, frozen, layersOpen, set } = useEmbeddedStore.getState();
    // A new page has no forced states.
    set({ pseudo: 'none', held: [] });
    await runInspector({ type: 'edit', on: edit });
    await runInspector({ type: 'freeze', on: frozen });
    if (layersOpen)
        await refreshTree();
    await discoverRoutes();
};
let fileRoutesAsked = false;
/** Find the app's routes: from its files once (Next.js), and from its router and links on every page. */
export const discoverRoutes = async () => {
    if (webview === null)
        return;
    const found = [];
    if (!fileRoutesAsked) {
        fileRoutesAsked = true;
        found.push(...(await window.scampEmbedded.routes().catch(() => [])));
    }
    try {
        const raw = (await webview.executeJavaScript(`(${readRoutesFn.toString()})()`));
        if (raw !== null)
            found.push(...flattenRoutes(raw).filter((r) => !r.splat).map((r) => r.path));
        const origin = new URL(useEmbeddedStore.getState().url ?? 'http://invalid').origin;
        const links = (await webview.executeJavaScript(`Array.from(document.querySelectorAll('a[href]'), (a) => a.href)`));
        for (const href of links) {
            const u = new URL(href);
            if (u.origin === origin)
                found.push(u.pathname);
        }
    }
    catch {
        // Mid-navigation: the next page load looks again.
    }
    const { routes, set } = useEmbeddedStore.getState();
    set({ routes: mergeRoutes(routes, found) });
};
/** Ask the page for its element tree, for the layers panel. */
export const refreshTree = async () => {
    if (webview === null)
        return;
    try {
        const tree = (await webview.executeJavaScript(inspectorTreeScript(config)));
        useEmbeddedStore.getState().set({ tree });
    }
    catch {
        // Mid-navigation: dom-ready asks again.
    }
};
export const selectTreeNode = (id) => {
    void runInspector({ type: 'selectId', id });
};
export const hoverTreeNode = (id) => {
    void runInspector({ type: 'hoverId', id });
};
/** Force a pseudo-class on the selection; later edits style that state. */
export const setPseudo = (state) => {
    flushPending();
    useEmbeddedStore.getState().set({ pseudo: state });
    void runInspector({ type: 'state', state });
};
/** Let go of every held state: freeze and the forced pseudo-class. */
export const releaseHeld = () => {
    useEmbeddedStore.getState().set({ pseudo: 'none', frozen: false });
    void runInspector({ type: 'release' });
};
export const attachWebview = (el) => {
    webview = el;
};
/** Back, forward or reload in the page. */
export const navigatePage = (kind) => {
    const nav = webview;
    try {
        if (kind === 'back')
            nav?.goBack();
        else if (kind === 'forward')
            nav?.goForward();
        else
            nav?.reload();
    }
    catch {
        // Not attached yet.
    }
};
/** Go to a path of the running app, never somewhere else. */
export const openPath = (path) => {
    const { url } = useEmbeddedStore.getState();
    if (url === null)
        return;
    const target = new URL(path.startsWith('/') ? path : `/${path}`, url);
    if (target.origin !== new URL(url).origin)
        return;
    void webview?.loadURL(target.href).catch(() => undefined);
};
/** Edit mode and freeze, in the window and in the page. */
export const setModes = (patch) => {
    useEmbeddedStore.getState().set(patch);
    if (patch.edit !== undefined)
        void runInspector({ type: 'edit', on: patch.edit });
    if (patch.frozen !== undefined)
        void runInspector({ type: 'freeze', on: patch.frozen });
    if (patch.edit === false) {
        flushPending();
        void runInspector({ type: 'deselect' });
        useEmbeddedStore.getState().set({ selection: null, pending: null, pseudo: 'none' });
    }
};
const loadStandIn = (selection) => {
    loading = true;
    const elements = standInTree({
        computed: selection.computed,
        parentDisplay: selection.parentDisplay,
        textOnly: selection.textOnly,
        tag: selection.element.tag,
        text: selection.element.text,
    });
    useCanvasStore.setState({ elements, rootElementId: ROOT_ELEMENT_ID, selectedElementIds: [STAND_IN_ID] });
    loading = false;
    useEmbeddedStore.getState().set({
        selection,
        pending: { id: newId(), baseline: elements, changes: [], applied: [], carried: [], sent: false },
    });
};
/** A console line from the page. Returns true when it was the inspector's. */
export const handleConsoleLine = (line) => {
    if (!line.startsWith(INSPECTOR_PREFIX))
        return false;
    let msg;
    try {
        msg = JSON.parse(line.slice(INSPECTOR_PREFIX.length));
    }
    catch {
        return true;
    }
    if (msg.type === 'select') {
        const { pending, selection, set } = useEmbeddedStore.getState();
        // A hot reload re-reports the same element: keep an edit in progress rather than reset it.
        const same = selection !== null &&
            (selection.uid === msg.uid ||
                (msg.element.source !== null && selection.element.source === msg.element.source && selection.element.tag === msg.element.tag));
        if (same && pending !== null && pending.changes.length > 0 && !pending.sent)
            return true;
        flushPending();
        if (selection?.uid !== msg.uid && !same)
            set({ pseudo: 'none' });
        // Keep a source main already resolved, rather than look it up again.
        const element = same && selection.raw !== null && msg.element.source === null ? { ...msg.element, source: selection.element.source } : msg.element;
        loadStandIn({ uid: msg.uid, raw: msg.raw, element, computed: msg.computed, parentDisplay: msg.parentDisplay, textOnly: msg.textOnly });
        if (msg.raw !== null && element.source === null && element.library === null)
            void resolveSelection(msg.uid);
    }
    else if (msg.type === 'forced') {
        useEmbeddedStore.getState().set({ held: msg.held });
        // Main applies the marks; then the panel reads the styles of the forced state.
        void window.scampEmbedded.syncPseudo().then(() => runInspector({ type: 'reselect' }));
    }
    else if (msg.type === 'treeChanged') {
        if (useEmbeddedStore.getState().layersOpen)
            void refreshTree();
        void discoverRoutes();
    }
    else if (msg.type === 'freeze') {
        useEmbeddedStore.getState().set({ frozen: msg.on });
    }
    else if (msg.type === 'deselect') {
        flushPending();
        useEmbeddedStore.getState().set({ selection: null, pending: null });
    }
    return true;
};
/** Look up a selection's source from React's debug location (Next.js), and patch it in. */
const resolveSelection = async (uid) => {
    const start = useEmbeddedStore.getState();
    if (start.selection === null || start.selection.raw === null)
        return;
    const { raw, element } = start.selection;
    start.set({ resolving: true });
    const { source } = await window.scampEmbedded.resolveSource(raw, { tag: element.tag, classes: element.classes, text: element.text });
    const { selection, set } = useEmbeddedStore.getState();
    if (selection === null || selection.uid !== uid) {
        set({ resolving: false });
        return;
    }
    const library = source !== null && source.includes('node_modules/') ? (/node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(source)?.[1] ?? null) : null;
    set({ resolving: false, selection: { ...selection, element: { ...selection.element, source: library === null ? source : null, library } } });
};
const queueItemFor = () => {
    const { pending, selection, scope, pseudo } = useEmbeddedStore.getState();
    // Unmapped elements are edited too: the prompt carries what the agent needs to find them.
    if (pending === null || selection === null || pending.changes.length === 0)
        return null;
    return { id: pending.id, kind: 'style', element: selection.element, scope, changes: pending.changes, ...(pseudo !== 'none' ? { state: pseudo } : {}) };
};
/** Send the edit in progress to the agent now. */
export const flushPending = () => {
    if (enqueueTimer !== null)
        clearTimeout(enqueueTimer);
    enqueueTimer = null;
    // Sent already and unchanged since: sending again would overwrite it, with the state as it is now.
    if (useEmbeddedStore.getState().pending?.sent === true)
        return;
    const item = queueItemFor();
    if (item === null)
        return;
    void window.scampEmbedded.enqueue(item);
    const { pending, set } = useEmbeddedStore.getState();
    if (pending !== null)
        set({ pending: { ...pending, sent: true } });
};
/** Apply the edit's current CSS to the page. */
const showOnPage = (changes) => {
    const { scope, pseudo } = useEmbeddedStore.getState();
    if (changes.length > 0) {
        void runInspector({ type: 'apply', scope, state: pseudo, styles: Object.fromEntries(changes.map((c) => [c.property, c.to])) });
    }
};
/** A panel edit landed on the stand-in: measure it, show it, and queue it. */
const handleStandInChange = () => {
    if (loading)
        return;
    const store = useEmbeddedStore.getState();
    const { pending } = store;
    if (pending === null || store.selection === null)
        return;
    const elements = useCanvasStore.getState().elements;
    const changes = styleChanges(pending.baseline, elements);
    const now = new Set(changes.map((c) => c.property));
    // Back at its starting value: an earlier edit's value stays on the page
    // (it's in the source, or on its way there); otherwise the page's own returns.
    const back = pending.changes.filter((c) => !now.has(c.property));
    const restore = back.filter((c) => !pending.carried.includes(c.property)).map((c) => c.property);
    const keep = back.filter((c) => pending.carried.includes(c.property)).map((c) => ({ property: c.property, to: c.from }));
    if (restore.length > 0)
        void runInspector({ type: 'restore', scope: 'all', properties: restore, state: store.pseudo });
    showOnPage([...changes, ...keep]);
    const applied = [...new Set([...pending.applied.filter((p) => !restore.includes(p)), ...changes.map((c) => c.property)])];
    store.set({ pending: { ...pending, changes, applied, sent: false } });
    if (enqueueTimer !== null)
        clearTimeout(enqueueTimer);
    enqueueTimer = setTimeout(flushPending, ENQUEUE_DELAY_MS);
};
/** Switch between this instance and all of them, moving the page's preview with it. */
export const setScope = (scope) => {
    const { pending, set, pseudo } = useEmbeddedStore.getState();
    if (pending !== null && pending.applied.length > 0)
        void runInspector({ type: 'restore', scope: 'all', properties: pending.applied, state: pseudo });
    set({ scope, ...(pending !== null ? { pending: { ...pending, sent: false } } : {}) });
    if (pending !== null && pending.changes.length > 0) {
        showOnPage(pending.changes);
        if (enqueueTimer !== null)
            clearTimeout(enqueueTimer);
        enqueueTimer = setTimeout(flushPending, ENQUEUE_DELAY_MS);
    }
};
/** An instruction for the agent, about the selection or the whole page. */
export const sendInstruction = async (text) => {
    const trimmed = text.trim();
    if (trimmed.length === 0)
        return;
    flushPending();
    const { selection, scope } = useEmbeddedStore.getState();
    await window.scampEmbedded.enqueue({ id: newId(), kind: 'instruction', element: selection?.element ?? null, scope, text: trimmed });
};
export const refreshGit = async () => {
    const git = await window.scampEmbedded.gitStatus();
    useEmbeddedStore.getState().set({ git, ...(git !== null ? { branch: git.branch } : {}) });
};
const handleAgentEvent = (event) => {
    const store = useEmbeddedStore.getState();
    if (event.kind === 'state') {
        const wasRunning = store.agent.phase === 'thinking' || store.agent.phase === 'writing';
        store.set({ agent: event.state });
        // The agent took the edit in progress: further edits start from here, a new item.
        const { pending } = store;
        if (pending !== null && pending.sent && !event.state.queued.some((q) => q.id === pending.id)) {
            store.set({
                pending: {
                    id: newId(),
                    baseline: useCanvasStore.getState().elements,
                    changes: [],
                    applied: pending.applied,
                    carried: [...new Set([...pending.carried, ...pending.changes.map((c) => c.property)])],
                    sent: false,
                },
            });
        }
        if (wasRunning && (event.state.phase === 'done' || event.state.phase === 'error')) {
            void refreshGit();
            // The source now has what the page previewed; with nothing else in
            // progress, drop the inline preview so the page shows the real code.
            const editing = useEmbeddedStore.getState().pending;
            if (event.state.phase === 'done' && event.state.queued.length === 0 && (editing === null || editing.changes.length === 0)) {
                void runInspector({ type: 'clear' });
                const latest = useEmbeddedStore.getState().pending;
                if (latest !== null)
                    store.set({ pending: { ...latest, applied: [], carried: [] } });
            }
        }
    }
    else if (event.kind === 'text') {
        store.appendLog({ kind: 'text', text: event.text });
    }
    else if (event.kind === 'tool') {
        store.appendLog({ kind: 'tool', text: event.summary, ok: event.ok });
    }
    else if (event.kind === 'report') {
        store.set({ report: event.markdown, checking: false });
    }
};
let started = false;
/** Wire the window's subscriptions once. */
export const startSession = () => {
    if (started)
        return;
    started = true;
    let before = useCanvasStore.getState().elements[STAND_IN_ID];
    useCanvasStore.subscribe((s) => {
        const now = s.elements[STAND_IN_ID];
        if (now === before)
            return;
        before = now;
        handleStandInChange();
    });
    window.scampEmbedded.onAgentEvent(handleAgentEvent);
};
