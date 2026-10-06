import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { captureFn, capturePolicy, prepareFn } from '@shared/captureScript';
import { flattenRoutes, readRoutesFn, routeForPath, selectedByDefault, viewNameForRoute, } from '@shared/reactRoutes';
import { BatchSummary } from './BatchSummary';
import { RoutePanel } from './RoutePanel';
import { useImportBatch } from './useImportBatch';
import styles from './ImportApp.module.css';
/**
 * The import window: a URL bar, a page, and an Import button.
 *
 * The capture runs here rather than in main, because `executeJavaScript`
 * on the `<webview>` tag is what reaches the live document — and the
 * live document, after cascade and scripts, is the thing worth reading.
 * What comes back is handed straight to main; this window never sees a
 * project, a file, or the element model.
 * see docs/plans/website-import-plan.md
 */
/**
 * How each fidelity level reads in the report.
 *
 * `~` for a fallback is deliberately not `!`: nothing is missing, so an
 * alarm would be wrong — but it is not free either, and `·` would hide
 * it among the bookkeeping. see docs/agent-native-review.md
 */
const FIDELITY_MARK = {
    lost: '!',
    'rendered-fallback': '~',
    approximated: '≈',
    exact: '·',
};
const FIDELITY_TITLE = {
    lost: 'Did not come across',
    'rendered-fallback': 'Renders, but you cannot edit it the way you could on the page',
    approximated: 'Close, but not identical',
    exact: 'Changed shape, changed nothing you can see',
};
const REPORT_CLASS = {
    lost: (s) => s['reportLost'],
    'rendered-fallback': (s) => s['reportFallback'],
    approximated: (s) => s['reportFallback'],
    exact: (s) => s['reportKept'],
};
/** `https://` in front of a bare host, so typing `stripe.com` works. */
/** How long after choosing a route a change of address counts as its redirect. */
const REDIRECT_WINDOW_MS = 4000;
const pathOf = (url) => {
    try {
        return new URL(url).pathname;
    }
    catch {
        return '';
    }
};
const normalizeUrl = (raw) => {
    const trimmed = raw.trim();
    if (trimmed.length === 0)
        return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed))
        return trimmed;
    return `https://${trimmed}`;
};
export const ImportApp = () => {
    const webviewRef = useRef(null);
    const [projectPath, setProjectPath] = useState('');
    const [breakpoints, setBreakpoints] = useState([]);
    const [draftUrl, setDraftUrl] = useState('');
    const [loadedUrl, setLoadedUrl] = useState('');
    const [canGoBack, setCanGoBack] = useState(false);
    const [canGoForward, setCanGoForward] = useState(false);
    const [status, setStatus] = useState({ kind: 'idle' });
    /**
     * The `<webview>` tag's methods — `executeJavaScript` among them —
     * only exist once it has emitted `dom-ready`. Before that the element
     * is in the DOM and the calls are not there, which reads exactly like
     * a button that does nothing.
     */
    const [webviewReady, setWebviewReady] = useState(false);
    const [reportOpen, setReportOpen] = useState(false);
    /** "Clean up with AI", once the user picks a token mode. */
    const [cleanup, setCleanup] = useState({ kind: 'idle' });
    /** Importing a React app: its name, its routes, and where they led. */
    const [react, setReact] = useState(null);
    const [routes, setRoutes] = useState({ kind: 'reading' });
    const [currentPath, setCurrentPath] = useState('');
    const requested = useRef(null);
    const [redirect, setRedirect] = useState(null);
    const [paramValues, setParamValues] = useState({});
    const [selectedRoutes, setSelectedRoutes] = useState(new Set());
    useEffect(() => {
        const offOpen = window.scampImport.onOpen((args) => {
            setProjectPath(args.projectPath);
            setBreakpoints(args.breakpoints ?? []);
            setReact(args.react ?? null);
            if (args.url) {
                setDraftUrl(args.url);
                setLoadedUrl(normalizeUrl(args.url));
            }
        });
        const offResult = window.scampImport.onResult((result) => {
            setStatus({ kind: 'done', result });
            // Opened by default when anything did not come across whole — a
            // loss OR a fallback that renders but cannot be edited. The second
            // is the one a screenshot will never tell you about.
            setReportOpen((result.findings ?? []).some((f) => f.fidelity === 'lost' || f.fidelity === 'rendered-fallback'));
        });
        return () => {
            offOpen();
            offResult();
        };
    }, []);
    // Keep the URL bar and the history buttons in step with the page.
    useEffect(() => {
        const node = webviewRef.current;
        if (!node)
            return;
        const wv = node;
        const refresh = () => {
            try {
                setCanGoBack(wv.canGoBack());
                setCanGoForward(wv.canGoForward());
            }
            catch {
                // Not attached yet; the next event will do it.
            }
        };
        const onNavigate = (e) => {
            const url = e.url;
            if (typeof url === 'string') {
                setDraftUrl(url);
                const landed = pathOf(url);
                setCurrentPath(landed);
                // A route that sends the page elsewhere straight away is a redirect
                // (a sign-in, a setup gate); a later move is the user navigating.
                const asked = requested.current;
                if (asked !== null && Date.now() - asked.at < REDIRECT_WINDOW_MS) {
                    setRedirect(landed === asked.path ? null : { from: asked.path, to: landed });
                }
                else {
                    setRedirect(null);
                    requested.current = null;
                }
            }
            // A new page invalidates the last import's verdict.
            setStatus((s) => (s.kind === 'idle' ? s : { kind: 'idle' }));
            refresh();
        };
        const onDomReady = () => {
            setWebviewReady(true);
            // A page that loaded after the reader gave up gets another look.
            setRoutes((r) => (r.kind === 'none' ? { kind: 'reading' } : r));
        };
        node.addEventListener('dom-ready', onDomReady);
        node.addEventListener('did-navigate', onNavigate);
        node.addEventListener('did-navigate-in-page', onNavigate);
        node.addEventListener('did-finish-load', refresh);
        return () => {
            node.removeEventListener('dom-ready', onDomReady);
            node.removeEventListener('did-navigate', onNavigate);
            node.removeEventListener('did-navigate-in-page', onNavigate);
            node.removeEventListener('did-finish-load', refresh);
        };
    }, [loadedUrl]);
    // A React app's routes, read from its running router once the page is
    // up. A dev server's first load can take many seconds (Vite optimises
    // dependencies), and the router exists only once React has mounted, so
    // keep trying for a while before saying there is none.
    useEffect(() => {
        if (react === null || !webviewReady || routes.kind !== 'reading')
            return;
        const node = webviewRef.current;
        if (!node?.executeJavaScript)
            return;
        let cancelled = false;
        void (async () => {
            for (let attempt = 0; attempt < 25 && !cancelled; attempt += 1) {
                try {
                    const raw = (await node.executeJavaScript(`(${readRoutesFn.toString()})()`));
                    if (Array.isArray(raw) && raw.length > 0) {
                        if (!cancelled) {
                            const flat = flattenRoutes(raw);
                            setRoutes({ kind: 'ready', routes: flat });
                            setSelectedRoutes(new Set(flat.filter(selectedByDefault).map((r) => r.path)));
                        }
                        return;
                    }
                }
                catch {
                    // The page navigated mid-read; try again.
                }
                await new Promise((r) => setTimeout(r, 800));
            }
            if (!cancelled)
                setRoutes({ kind: 'none' });
        })();
        return () => {
            cancelled = true;
        };
    }, [react, webviewReady, routes.kind]);
    const handleVisit = useCallback((path) => {
        const node = webviewRef.current;
        if (!node?.loadURL || loadedUrl.length === 0)
            return;
        const target = new URL(path, loadedUrl).href;
        requested.current = { path: pathOf(target), at: Date.now() };
        setRedirect(null);
        node.loadURL(target);
    }, [loadedUrl]);
    const handleGo = useCallback(() => {
        const next = normalizeUrl(draftUrl);
        if (next.length === 0)
            return;
        setWebviewReady(false);
        requested.current = null;
        setRedirect(null);
        setLoadedUrl(next);
        const node = webviewRef.current;
        // Already mounted: navigate it. First load: the `src` does it.
        if (node?.loadURL)
            node.loadURL(next);
    }, [draftUrl]);
    /**
     * Read the page at the widest breakpoint, then at each narrower one.
     * Shared by Import and by a multi-page run. Restores the webview's
     * width whatever happens.
     */
    const readAllWidths = useCallback(async (onWidth) => {
        const node = webviewRef.current;
        if (!node?.executeJavaScript) {
            throw new Error('The page is not ready to read yet — wait for it to finish loading.');
        }
        const frame = webviewRef.current;
        const restoreWidth = frame?.style.width ?? '';
        const restoreFlex = frame?.style.flex ?? '';
        // The capture function is serialized and evaluated in the page,
        // with the policy passed in as data — it cannot import anything
        // once it is over there. The scroll settles reveal-on-scroll
        // content, which is otherwise recorded invisible.
        // Called through `node`, not hoisted: `executeJavaScript` is a
        // method on the webview element and loses its receiver if you
        // detach it, which hangs rather than throwing.
        const run = (code) => node.executeJavaScript(code);
        const readPage = async () => {
            await run(`(${prepareFn.toString()})()`);
            return run(`(${captureFn.toString()})(${JSON.stringify(capturePolicy())})`);
        };
        // `flex: none` as well as the width: the webview is a flex item
        // with `flex: 1 1 auto`, so grow wins over any width set on it and
        // the guest never actually narrows. A `<webview>`'s guest viewport
        // follows the element's size, so sizing it is what makes the page's
        // own media queries fire.
        const sizeTo = async (width) => {
            if (!frame)
                return;
            frame.style.flex = '0 0 auto';
            frame.style.width = `${width}px`;
            // Let layout settle and the page's own resize handlers run.
            await new Promise((r) => setTimeout(r, 450));
        };
        try {
            // Read the page at the project's widest breakpoint, the width its
            // desktop design is for — not whatever width the window happens to be.
            const [widest, ...smaller] = [...breakpoints].sort((a, b) => b.width - a.width);
            if (widest !== undefined)
                await sizeTo(widest.width);
            const payload = await readPage();
            const narrower = [];
            for (const bp of smaller) {
                if (!frame)
                    break;
                onWidth?.(bp.label);
                await sizeTo(bp.width);
                try {
                    narrower.push({ breakpointId: bp.id, payload: await readPage() });
                }
                catch {
                    // A width that fails is one breakpoint's worth of overrides,
                    // not a failed import.
                }
            }
            return { payload, narrower };
        }
        finally {
            if (frame) {
                frame.style.width = restoreWidth;
                frame.style.flex = restoreFlex;
            }
        }
    }, [breakpoints]);
    const handleImport = useCallback(async () => {
        if (projectPath.length === 0)
            return;
        setStatus({ kind: 'capturing' });
        try {
            const { payload, narrower } = await readAllWidths((label) => setStatus({ kind: 'capturing', at: label }));
            setStatus({ kind: 'capturing' });
            // A React route names its view; a page's title would name every
            // route of a single-page app the same.
            const route = react !== null && routes.kind === 'ready' ? routeForPath(routes.routes, currentPath) : null;
            const nameHint = react === null ? undefined : viewNameForRoute(route?.path ?? currentPath);
            const sent = await window.scampImport.deliver(projectPath, payload, narrower, nameHint);
            if (!sent.ok) {
                setStatus({ kind: 'failed', message: sent.error ?? 'Scamp could not take the page.' });
            }
            // On success the app window answers over `onResult`.
        }
        catch (err) {
            setStatus({
                kind: 'failed',
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }, [projectPath, readAllWidths, react, routes, currentPath]);
    const importBatch = useImportBatch({ webviewRef, projectPath, baseUrl: loadedUrl, readAllWidths });
    const batchRunning = importBatch.batch?.running === true;
    const handleToggleRoute = useCallback((route) => {
        setSelectedRoutes((current) => {
            const next = new Set(current);
            if (next.has(route))
                next.delete(route);
            else
                next.add(route);
            return next;
        });
    }, []);
    const nav = (method) => () => {
        const node = webviewRef.current;
        node?.[method]?.();
    };
    const busy = status.kind === 'capturing' || batchRunning;
    // A new import gets its own offer.
    useEffect(() => {
        setCleanup({ kind: 'idle' });
    }, [status]);
    const handleCleanup = async (viewName, tokenMode) => {
        const result = await window.scampImport.startCleanup(projectPath, viewName, tokenMode);
        setCleanup(result.ok ? { kind: 'started' } : { kind: 'failed', message: result.error ?? 'Couldn’t start the cleanup.' });
    };
    return (_jsxs("div", { className: styles.shell, children: [_jsxs("div", { className: styles.toolbar, children: [_jsx("button", { className: styles.navBtn, onClick: nav('goBack'), disabled: !canGoBack, title: "Back", children: "\u2039" }), _jsx("button", { className: styles.navBtn, onClick: nav('goForward'), disabled: !canGoForward, title: "Forward", children: "\u203A" }), _jsx("button", { className: styles.navBtn, onClick: nav('reload'), disabled: !loadedUrl, title: "Reload", children: "\u27F3" }), _jsx("input", { className: styles.urlBar, value: draftUrl, onChange: (e) => setDraftUrl(e.target.value), onKeyDown: (e) => {
                            if (e.key === 'Enter')
                                handleGo();
                        }, placeholder: "Paste a URL, then navigate to the page you want", spellCheck: false, "aria-label": "Address" }), _jsx("button", { className: styles.importBtn, onClick: () => void handleImport(), disabled: !loadedUrl || !webviewReady || busy || projectPath.length === 0, children: busy
                            ? status.kind === 'capturing' && status.at
                                ? `Reading at ${status.at}…`
                                : 'Reading the page…'
                            : 'Import' })] }), importBatch.batch !== null && (_jsx(BatchSummary, { batch: importBatch.batch, onStop: importBatch.stop, onUndo: () => void importBatch.undo(), onDismiss: importBatch.dismiss })), importBatch.batch === null && status.kind !== 'idle' && status.kind !== 'capturing' && (_jsx("div", { className: `${styles.banner} ${status.kind === 'failed' || !status.result?.ok ? styles.bannerBad : styles.bannerGood}`, children: status.kind === 'failed' ? (_jsx("span", { children: status.message })) : status.result.ok ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: styles.bannerHead, children: [_jsxs("span", { children: ["Imported ", _jsx("strong", { children: status.result.viewName }), " \u2014", ' ', status.result.elementCount, " elements"] }), (status.result.findings?.length ?? 0) > 0 && (_jsxs("button", { className: styles.reportToggle, onClick: () => setReportOpen((v) => !v), type: "button", children: [reportOpen ? 'Hide' : 'What changed', " (", status.result.findings?.length, ")"] }))] }), status.result.cleanupAvailable === true && status.result.viewName !== undefined && (_jsx("div", { className: styles.cleanup, "data-testid": "import-cleanup", children: cleanup.kind === 'started' ? (_jsx("span", { children: "Cleanup started. Continue in the Scamp window, where the agent shows its plan." })) : (_jsxs(_Fragment, { children: [_jsxs("span", { className: styles.cleanupText, children: [_jsx("strong", { children: "Clean up with AI." }), " The Scamp Agent makes this page easier to edit without changing how it looks, and shows you a plan first. For repeated colors and sizes:"] }), _jsxs("span", { className: styles.cleanupActions, children: [_jsx("button", { type: "button", className: styles.cleanupBtn, onClick: () => void handleCleanup(status.result.viewName ?? '', 'create-tokens'), children: "Create theme tokens" }), _jsx("button", { type: "button", className: styles.cleanupBtn, onClick: () => void handleCleanup(status.result.viewName ?? '', 'keep-literal'), children: "Keep hex values" })] }), cleanup.kind === 'failed' && _jsx("span", { className: styles.cleanupError, children: cleanup.message })] })) })), reportOpen && (
                        // An import is a lossy translation, and it is lossy in
                        // more than one way. Worst first, each marked with how
                        // faithfully it survived.
                        _jsx("ul", { className: styles.report, children: status.result.findings?.map((f) => (_jsxs("li", { className: REPORT_CLASS[f.fidelity](styles), children: [_jsx("span", { className: styles.reportMark, title: FIDELITY_TITLE[f.fidelity], children: FIDELITY_MARK[f.fidelity] }), _jsxs("span", { children: [f.label, f.examples.length > 0 && (_jsxs("span", { className: styles.reportWhere, children: [" \u2014 ", f.examples.join(', ')] })), f.editable !== undefined && (_jsx("span", { className: styles.reportEditable, children: f.editable }))] })] }, f.kind))) }))] })) : (_jsx("span", { children: status.result.error ?? 'The import failed.' })) })), _jsxs("div", { className: styles.viewport, children: [react !== null && (_jsx(RoutePanel, { state: routes, current: routes.kind === 'ready' ? routeForPath(routes.routes, currentPath) : null, redirect: redirect, disabled: busy || !webviewReady, values: paramValues, onValues: setParamValues, selected: selectedRoutes, onToggle: handleToggleRoute, onVisit: handleVisit, onImportSelected: (targets) => {
                            setStatus({ kind: 'idle' });
                            void importBatch.start(targets);
                        } })), loadedUrl ? (_jsx("webview", { 
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        ref: webviewRef, src: loadedUrl, className: styles.webview, ...(react !== null ? { partition: `persist:react-import-${react.appName.replace(/[^A-Za-z0-9_-]/g, '_')}` } : {}) })) : (_jsxs("div", { className: styles.empty, children: [_jsx("p", { className: styles.emptyTitle, children: "Import a page" }), _jsxs("p", { className: styles.emptyBody, children: ["Paste a URL above and navigate to the page you want. Clicking", _jsx("strong", { children: " Import" }), " reads the page as it is on screen and makes a new view from it."] })] }))] })] }));
};
