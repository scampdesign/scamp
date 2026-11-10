import { breakpointFor, authoredStyles, EMBEDDED_COMPUTED_PROPERTIES, INSPECTOR_PREFIX, inspectorBreakpointsScript, inspectorTokensScript, inspectorScript, inspectorTreeScript, mergeRoutes, describeChange, } from '@shared/embedded';
import { flattenRoutes, readRoutesFn } from '@shared/reactRoutes';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { STAND_IN_ID, standInTree, styleChanges } from '@lib/embeddedStandIn';
import { addAgentText, addAgentTool, endTurn, setTurnUndone, startTurn } from '@lib/embeddedChat';
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
const config = { prefix: INSPECTOR_PREFIX, attr: SOURCE_ATTR, callAttr: 'data-scamp-call', properties: [...EMBEDDED_COMPUTED_PROPERTIES] };
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
    await Promise.all([discoverRoutes(), refreshBreakpoints(), refreshTokens()]);
};
/**
 * The page's `:root` custom properties become the panel's design system, so
 * its pickers offer them, and a choice is sent as `var(--name)`.
 * shortcut: a Tailwind v3 theme in `tailwind.config` isn't read; read it when a v3 project asks for tokens.
 */
const refreshTokens = async () => {
    if (webview === null)
        return;
    try {
        const found = (await webview.executeJavaScript(inspectorTokensScript(config)));
        if (Array.isArray(found))
            useCanvasStore.getState().setThemeTokens(found);
    }
    catch {
        // Mid-navigation: the next load reads them.
    }
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
/** Move a layer next to a sibling; the page answers with `moved`, which queues it. */
export const moveTreeNode = (id, targetId, position) => {
    void runInspector({ type: 'move', id, targetId, position, tag: newId() });
};
/** An element as the agent should see it: with its source looked up when React only gave a location (Next.js). */
const withSource = async (element, raw) => {
    if (element.source !== null || raw === null || element.library !== null)
        return element;
    const { source } = await window.scampEmbedded.resolveSource(raw, { tag: element.tag, classes: element.classes, text: element.text });
    const library = source !== null && source.includes('node_modules/') ? (/node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(source)?.[1] ?? null) : null;
    return { ...element, source: library === null ? source : null, library };
};
const queueMove = async (msg) => {
    flushPending();
    const [element, target] = await Promise.all([withSource(msg.element, msg.raw), withSource(msg.target, msg.targetRaw)]);
    // The page tagged its preview with this id: the queue item takes it, so undo can take back both.
    const item = { id: msg.tag, kind: 'move', element, target, position: msg.position, fromList: msg.fromList };
    await window.scampEmbedded.enqueue(item);
    pushUndo({ kind: 'item', id: item.id, item, ...labelled(item), redo: [{ type: 'move', id: msg.uid, targetId: msg.targetUid, position: msg.position, tag: msg.tag }] });
};
/** Delete, duplicate, or wrap the selection: previewed on the page, then queued for the agent. see docs/plans/embedded-canvas-gaps.md (gap 7) */
export const structureEdit = async (action) => {
    flushPending();
    const { selection, scope, set } = useEmbeddedStore.getState();
    if (selection === null)
        return;
    const reach = selection.element.instanceCount > 1 ? scope : 'instance';
    const tag = newId();
    const command = { type: 'structure', uid: selection.uid, action, scope: reach, tag };
    await runInspector(command);
    const item = { id: tag, kind: 'structure', action, element: selection.element, ...(selection.also.length > 0 ? { also: selection.also } : {}), scope: reach };
    await window.scampEmbedded.enqueue(item);
    pushUndo({ kind: 'item', id: item.id, item, ...labelled(item), redo: [command] });
    if (action === 'delete') {
        await runInspector({ type: 'deselect' });
        set({ selection: null, pending: null });
    }
};
// --- Undo and redo. see docs/plans/embedded-canvas-gaps.md (P2)
/** An undo step's plain words, and its technical form for the tooltip. */
const labelled = (item) => {
    const { text, detail } = describeChange(item);
    return { label: text, detail };
};
/** A new step: it goes on the undo stack, and ends what redo could bring back. */
const pushUndo = (entry) => {
    const { undo, set } = useEmbeddedStore.getState();
    // An edit sent again (a scope switch) replaces its own entry.
    const rest = entry.kind === 'item' ? undo.filter((e) => !(e.kind === 'item' && e.id === entry.id)) : undo;
    set({ undo: [...rest, entry], redo: [] });
};
let toastTimer = null;
const toast = (text) => {
    useEmbeddedStore.getState().set({ toast: text });
    if (toastTimer !== null)
        clearTimeout(toastTimer);
    toastTimer = setTimeout(() => useEmbeddedStore.getState().set({ toast: null }), 3000);
};
/** Take an item out of the queue with ✕: its preview goes, and so does its undo step. */
export const removeQueued = async (id) => {
    await window.scampEmbedded.removeQueued(id);
    await runInspector({ type: 'undoTag', tag: id });
    const { undo, set } = useEmbeddedStore.getState();
    set({ undo: undo.filter((e) => !(e.kind === 'item' && e.id === id)) });
};
/** Accept or Discard ends what runs undo can reach: from there it's the history. */
export const dropRunEntries = () => {
    const { undo, redo, set } = useEmbeddedStore.getState();
    set({ undo: undo.filter((e) => e.kind !== 'run'), redo: redo.filter((e) => e.kind !== 'run') });
};
export const undo = async () => {
    flushPending();
    const store = useEmbeddedStore.getState();
    const entry = store.undo[store.undo.length - 1];
    if (entry === undefined) {
        await historyStep('back');
        return;
    }
    if (entry.kind === 'item') {
        // Main decides: the window's copy of the queue can lag an edit sent a moment ago.
        if (!(await window.scampEmbedded.removeQueued(entry.id))) {
            toast('The agent is writing that change. Stop it first, or undo once it’s done.');
            return;
        }
        await runInspector({ type: 'undoTag', tag: entry.id });
        if (entry.item.kind === 'content')
            void runInspector({ type: 'reselect' });
        if (store.pending?.id === entry.id) {
            // The panel shows the edit undone: read the element again.
            store.set({ pending: null });
            void runInspector({ type: 'reselect' });
        }
    }
    else {
        const result = await window.scampEmbedded.undoRun(entry.runId);
        if (!result.ok) {
            toast(result.error);
            return;
        }
        void refreshGit();
    }
    const now = useEmbeddedStore.getState();
    now.set({ undo: now.undo.slice(0, -1), redo: [...now.redo, entry], ...(entry.kind === 'run' ? { chat: setTurnUndone(now.chat, entry.runId, true) } : {}) });
    toast(`Undid: ${entry.label}`);
};
/** Undo one turn of the conversation: what its run wrote, if the files are still as it left them. */
export const undoTurn = async (runId) => {
    flushPending();
    const result = await window.scampEmbedded.undoRun(runId);
    if (!result.ok) {
        toast(result.error);
        return;
    }
    const { undo, chat, set } = useEmbeddedStore.getState();
    set({ undo: undo.filter((e) => !(e.kind === 'run' && e.runId === runId)), chat: setTurnUndone(chat, runId, true) });
    void refreshGit();
};
export const redo = async () => {
    flushPending();
    const store = useEmbeddedStore.getState();
    const entry = store.redo[store.redo.length - 1];
    if (entry === undefined) {
        await historyStep('forward');
        return;
    }
    if (entry.kind === 'item') {
        await window.scampEmbedded.enqueue(entry.item);
        for (const cmd of entry.redo)
            await runInspector(cmd);
        if (entry.item.kind === 'content')
            void runInspector({ type: 'reselect' });
    }
    else {
        const result = await window.scampEmbedded.undoRun(entry.runId, true);
        if (!result.ok) {
            toast(result.error);
            return;
        }
        void refreshGit();
    }
    const now = useEmbeddedStore.getState();
    now.set({ redo: now.redo.slice(0, -1), undo: [...now.undo, entry], ...(entry.kind === 'run' ? { chat: setTurnUndone(now.chat, entry.runId, false) } : {}) });
    toast(`Redid: ${entry.label}`);
};
// --- History. see docs/plans/embedded-canvas-gaps.md (P3)
export const refreshHistory = async () => {
    useEmbeddedStore.getState().set({ history: await window.scampEmbedded.history() });
};
/** Move the project to a point in its history; the result says why when it can't. */
export const goToHistory = async (sha) => {
    flushPending();
    const result = await window.scampEmbedded.historyGoTo(sha);
    if (result.ok) {
        // The files changed under the page: drop the preview, and read everything again.
        void runInspector({ type: 'clear' });
        useEmbeddedStore.getState().set({ pending: null });
        void runInspector({ type: 'reselect' });
    }
    await Promise.all([refreshHistory(), refreshGit()]);
    return result;
};
/** Cmd+Z past every edit and run goes back a step in the history; Cmd+Shift+Z forward. */
const historyStep = async (direction) => {
    await refreshHistory();
    const history = useEmbeddedStore.getState().history;
    if (history === null)
        return;
    const entries = history.entries;
    const at = entries.findIndex((e) => e.current);
    const target = direction === 'back'
        ? at === -1
            ? null
            : (entries[at + 1]?.sha ?? history.base)
        : at === -1
            ? (entries[entries.length - 1]?.undone === true ? entries[entries.length - 1]?.sha : null)
            : entries[at - 1]?.undone === true
                ? entries[at - 1]?.sha
                : null;
    if (target === null || target === undefined) {
        toast(direction === 'back' ? 'Nothing to undo.' : 'Nothing to redo.');
        return;
    }
    const result = await goToHistory(target);
    toast(result.ok ? (direction === 'back' ? 'Went back a step in the history.' : 'Went forward a step in the history.') : result.error);
};
// --- Breakpoints. see docs/plans/embedded-canvas-gaps.md (P4)
/** The breakpoint an edit made now applies up to, or null at desktop. */
const currentBreakpoint = () => {
    const { viewport, pageBreakpoints: b } = useEmbeddedStore.getState();
    const project = [...new Set([...b.min, ...b.max])];
    const direction = b.min.length === 0 && b.max.length === 0 ? null : b.min.length >= b.max.length ? 'min' : 'max';
    return breakpointFor(viewport, project, direction);
};
const mediaFor = (bp) => (bp === null ? null : `(max-width: ${bp.upTo}px)`);
/** Read the widths the app's stylesheets break at. */
export const refreshBreakpoints = async () => {
    if (webview === null)
        return;
    try {
        const found = (await webview.executeJavaScript(inspectorBreakpointsScript(config)));
        if (found !== null)
            useEmbeddedStore.getState().set({ pageBreakpoints: found });
    }
    catch {
        // Mid-navigation: the next load reads them.
    }
};
/** Size the app as a phone, a tablet, a width of your own, or the window (null). */
export const setViewport = (width) => {
    flushPending();
    const clean = width === null ? null : Math.max(240, Math.min(3000, Math.round(width)));
    useEmbeddedStore.getState().set({ viewport: clean });
    // The page reflows at the new width: once it has, the panel reads the element again.
    setTimeout(() => void runInspector({ type: 'reselect' }), 250);
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
        loadStandIn({
            uid: msg.uid,
            raw: msg.raw,
            element,
            calls: msg.calls,
            content: msg.content,
            origins: {},
            // In a forced state the page's rules for it don't match, so only computed values are right.
            computed: useEmbeddedStore.getState().pseudo === 'none' ? { ...msg.computed, ...authoredStyles(msg.rules, msg.computed) } : msg.computed,
            rules: msg.rules,
            also: (msg.also ?? []).map((a) => a.element),
            parentDisplay: msg.parentDisplay,
            textOnly: msg.textOnly,
        });
        if (selection?.uid !== msg.uid)
            set({ dragNote: null });
        if (msg.raw !== null && element.source === null && element.library === null)
            void resolveSelection(msg.uid);
        else
            void lookUpOrigins(msg.uid);
    }
    else if (msg.type === 'forced') {
        useEmbeddedStore.getState().set({ held: msg.held });
        // Main applies the marks; then the panel reads the styles of the forced state.
        void window.scampEmbedded.syncPseudo().then(() => runInspector({ type: 'reselect' }));
    }
    else if (msg.type === 'dragNote') {
        useEmbeddedStore.getState().set({ dragNote: msg.text });
    }
    else if (msg.type === 'moved') {
        void queueMove(msg);
    }
    else if (msg.type === 'treeChanged') {
        if (useEmbeddedStore.getState().layersOpen)
            void refreshTree();
        void discoverRoutes();
    }
    else if (msg.type === 'structureKey') {
        void structureEdit(msg.action);
    }
    else if (msg.type === 'requestTextEdit') {
        void requestTextEdit(msg.uid);
    }
    else if (msg.type === 'textEdited') {
        const { selection } = useEmbeddedStore.getState();
        if (selection?.uid === msg.uid)
            void commitContent('text', msg.text);
    }
    else if (msg.type === 'undo') {
        void undo();
    }
    else if (msg.type === 'redo') {
        void redo();
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
    void lookUpOrigins(uid);
};
// --- Content: text, images, and links. see docs/plans/embedded-canvas-gaps.md (P5)
/** The selection's content fields: text when it's only text, an image's source and alt, a link's target. */
export const contentFields = (selection) => ['text', 'src', 'alt', 'href'].filter((f) => selection.content[f] !== null);
/** Ask main where each of the selection's content fields comes from. */
const lookUpOrigins = async (uid) => {
    const start = useEmbeddedStore.getState().selection;
    if (start === null || start.uid !== uid)
        return;
    const fields = contentFields(start);
    if (fields.length === 0)
        return;
    const source = start.element.source;
    // Without the build's tag (Next.js), find each call site from React's record of it.
    const calls = await Promise.all(start.calls.map(async (c) => c.call !== null || c.raw == null
        ? c
        : { ...c, call: (await window.scampEmbedded.resolveSource(c.raw, { tag: c.name, classes: [], text: '' })).source }));
    const found = {};
    for (const field of fields) {
        found[field] =
            source === null
                ? { kind: 'unknown', reason: start.element.library !== null ? `it comes from ${start.element.library}` : 'Scamp couldn’t find where this element is written' }
                : await window.scampEmbedded.contentOrigin(source, field, calls);
    }
    const { selection, set } = useEmbeddedStore.getState();
    if (selection === null || selection.uid !== uid)
        return;
    const usedAt = selection.element.usedAt ?? calls.find((c) => c.call !== null)?.call ?? null;
    set({ selection: { ...selection, element: { ...selection.element, usedAt }, origins: { ...selection.origins, ...found } } });
};
const editable = (origin) => origin !== undefined && (origin.kind === 'literal' || origin.kind === 'import' || origin.kind === 'prop');
/** Why a field can't be edited here, or null when it can (or Scamp is still looking). */
export const notEditableReason = (origin) => origin === undefined || editable(origin) ? null : `This can’t be edited here: ${origin.reason}.`;
/** Pick an image from disk: Scamp copies it into `public/` and points the selected image at it. */
export const chooseImage = async () => {
    const result = await window.scampEmbedded.chooseImage();
    if (result.kind === 'error')
        toast(result.error);
    else if (result.kind === 'ok')
        await commitContent('src', result.url);
};
/** Show new content on the page at once, and queue it for the agent. */
export const commitContent = async (field, value) => {
    flushPending();
    const { selection, set } = useEmbeddedStore.getState();
    if (selection === null)
        return;
    const origin = selection.origins[field];
    const from = selection.content[field] ?? '';
    if (!editable(origin) || value === from)
        return;
    const item = { id: newId(), kind: 'content', element: selection.element, field, from, to: value, origin };
    const preview = { type: 'setContent', uid: selection.uid, field, value, tag: item.id };
    await runInspector(preview);
    await window.scampEmbedded.enqueue(item);
    pushUndo({ kind: 'item', id: item.id, item, ...labelled(item), redo: [preview] });
    set({ selection: { ...selection, content: { ...selection.content, [field]: value } } });
};
/** A double-click on text in the page: open the editor if it's written in the code, or say why not. */
const requestTextEdit = async (uid) => {
    const store = useEmbeddedStore.getState();
    if (store.selection?.uid !== uid) {
        // The first click of the double-click selects; wait for the window to have it.
        await runInspector({ type: 'selectId', id: uid });
        await new Promise((r) => setTimeout(r, 50));
    }
    const selection = useEmbeddedStore.getState().selection;
    if (selection === null || selection.uid !== uid)
        return;
    if (selection.origins.text === undefined)
        await lookUpOrigins(uid);
    const origin = useEmbeddedStore.getState().selection?.origins.text;
    const reason = notEditableReason(origin);
    if (reason !== null) {
        toast(reason);
        return;
    }
    if (origin !== undefined)
        await runInspector({ type: 'beginTextEdit', uid });
};
const queueItemFor = () => {
    const { pending, selection, scope, pseudo } = useEmbeddedStore.getState();
    // Unmapped elements are edited too: the prompt carries what the agent needs to find them.
    if (pending === null || selection === null || pending.changes.length === 0)
        return null;
    const breakpoint = currentBreakpoint();
    return {
        id: pending.id,
        kind: 'style',
        element: selection.element,
        ...(selection.also.length > 0 ? { also: selection.also } : {}),
        scope,
        changes: pending.changes,
        ...(pseudo !== 'none' ? { state: pseudo } : {}),
        ...(breakpoint !== null ? { breakpoint } : {}),
    };
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
    const { pending, set, selection, scope, pseudo } = useEmbeddedStore.getState();
    if (pending !== null)
        set({ pending: { ...pending, sent: true } });
    if (item.kind === 'style') {
        const styles = Object.fromEntries(item.changes.map((c) => [c.property, c.to]));
        const redoApply = { type: 'apply', uid: selection?.uid, scope, state: pseudo, styles, media: mediaFor(item.breakpoint ?? null), tag: item.id };
        pushUndo({ kind: 'item', id: item.id, item, ...labelled(item), redo: [redoApply] });
    }
};
/** Apply the edit's current CSS to the page. */
const showOnPage = (changes) => {
    const { scope, pseudo, selection, pending } = useEmbeddedStore.getState();
    if (changes.length > 0) {
        void runInspector({
            type: 'apply',
            uid: selection?.uid,
            scope,
            state: pseudo,
            media: mediaFor(currentBreakpoint()),
            tag: pending?.id,
            styles: Object.fromEntries(changes.map((c) => [c.property, c.to])),
        });
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
    if (restore.length > 0) {
        void runInspector({ type: 'restore', uid: store.selection.uid, scope: 'all', properties: restore, state: store.pseudo, media: mediaFor(currentBreakpoint()) });
    }
    showOnPage([...changes, ...keep]);
    const applied = [...new Set([...pending.applied.filter((p) => !restore.includes(p)), ...changes.map((c) => c.property)])];
    store.set({ pending: { ...pending, changes, applied, sent: false } });
    if (enqueueTimer !== null)
        clearTimeout(enqueueTimer);
    enqueueTimer = setTimeout(flushPending, ENQUEUE_DELAY_MS);
};
/** Switch between this instance and all of them, moving the page's preview with it. */
export const setScope = (scope) => {
    const { pending, set, pseudo, selection } = useEmbeddedStore.getState();
    if (pending !== null && pending.applied.length > 0) {
        void runInspector({ type: 'restore', uid: selection?.uid, scope: 'all', properties: pending.applied, state: pseudo, media: mediaFor(currentBreakpoint()) });
    }
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
    const item = { id: newId(), kind: 'instruction', element: selection?.element ?? null, scope, text: trimmed };
    await window.scampEmbedded.enqueue(item);
    pushUndo({ kind: 'item', id: item.id, item, ...labelled(item), redo: [] });
};
export const refreshGit = async () => {
    const git = await window.scampEmbedded.gitStatus();
    useEmbeddedStore.getState().set({ git, ...(git !== null ? { branch: git.branch } : {}) });
};
const handledRuns = new Set();
const handleAgentEvent = (event) => {
    const store = useEmbeddedStore.getState();
    if (event.kind === 'state') {
        const wasRunning = store.agent.phase === 'thinking' || store.agent.phase === 'writing';
        const nowRunning = event.state.phase === 'thinking' || event.state.phase === 'writing';
        // A run began: the batch it took is the user's side of the turn.
        if (!wasRunning && nowRunning) {
            const taken = store.agent.queued.filter((q) => !event.state.queued.some((n) => n.id === q.id));
            store.set({ chat: startTurn(store.chat, newId(), taken.map((q) => describeChange(q).text)) });
        }
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
        // A run finished: its items' undo entries become one entry for what it wrote.
        const runId = event.state.lastRunId;
        if (runId !== undefined && !handledRuns.has(runId) && (event.state.phase === 'done' || event.state.phase === 'error')) {
            handledRuns.add(runId);
            const ids = new Set(event.state.lastRunItemIds);
            const { undo } = useEmbeddedStore.getState();
            const taken = undo.filter((e) => e.kind === 'item' && ids.has(e.id));
            const labels = taken.map((e) => e.label);
            const label = labels.length === 0 ? 'the agent’s changes' : labels.length === 1 ? (labels[0] ?? '') : `${labels[0]}, and ${labels.length - 1} more`;
            const detail = taken.map((e) => e.detail).filter((d) => d.length > 0).join('\n');
            useEmbeddedStore.getState().set({ undo: [...undo.filter((e) => !(e.kind === 'item' && ids.has(e.id))), { kind: 'run', runId, label, detail }], redo: [] });
        }
        if (wasRunning && !nowRunning && runId !== undefined) {
            const status = event.state.phase === 'done' ? 'done' : event.state.phase === 'error' ? 'error' : 'stopped';
            const { chat, set } = useEmbeddedStore.getState();
            set({ chat: endTurn(chat, runId, status, status === 'done' ? undefined : event.state.message) });
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
        store.set({ chat: addAgentText(store.chat, event.text) });
    }
    else if (event.kind === 'tool') {
        store.set({ chat: addAgentTool(store.chat, event.summary, event.ok) });
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
    window.scampEmbedded.onStartProgress((p) => {
        if (p.kind === 'log')
            useEmbeddedStore.setState((s) => ({ startLog: (s.startLog + p.text).slice(-20000) }));
    });
    // Cmd+Z in the window (not in a field or the terminal, which have their own).
    window.addEventListener('keydown', (e) => {
        if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'z')
            return;
        const t = e.target;
        if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable))
            return;
        e.preventDefault();
        void (e.shiftKey ? redo() : undo());
    });
    // Main answers the user's own agent's "what's selected" from this.
    let selected = useEmbeddedStore.getState().selection?.element ?? null;
    useEmbeddedStore.subscribe((st) => {
        const now = st.selection?.element ?? null;
        if (now === selected)
            return;
        selected = now;
        window.scampEmbedded.selectionChanged(now);
    });
};
