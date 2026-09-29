import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { captureFn, capturePolicy, prepareFn } from '@shared/captureScript';
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
    useEffect(() => {
        const offOpen = window.scampImport.onOpen((args) => {
            setProjectPath(args.projectPath);
            setBreakpoints(args.breakpoints ?? []);
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
            if (typeof url === 'string')
                setDraftUrl(url);
            // A new page invalidates the last import's verdict.
            setStatus((s) => (s.kind === 'idle' ? s : { kind: 'idle' }));
            refresh();
        };
        const onDomReady = () => setWebviewReady(true);
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
    const handleGo = useCallback(() => {
        const next = normalizeUrl(draftUrl);
        if (next.length === 0)
            return;
        setWebviewReady(false);
        setLoadedUrl(next);
        const node = webviewRef.current;
        // Already mounted: navigate it. First load: the `src` does it.
        if (node?.loadURL)
            node.loadURL(next);
    }, [draftUrl]);
    const handleImport = useCallback(async () => {
        const node = webviewRef.current;
        if (!node?.executeJavaScript || projectPath.length === 0) {
            setStatus({
                kind: 'failed',
                message: 'The page is not ready to read yet — wait for it to finish loading.',
            });
            return;
        }
        setStatus({ kind: 'capturing' });
        const frame = webviewRef.current;
        const restoreWidth = frame?.style.width ?? '';
        const restoreFlex = frame?.style.flex ?? '';
        try {
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
            const payload = await readPage();
            // Then the same page at each narrower breakpoint. A `<webview>`'s
            // guest viewport follows the element's size, so narrowing it is
            // what makes the page's own media queries fire — there is no other
            // way to see its tablet layout from out here.
            const narrower = [];
            const smaller = [...breakpoints].sort((a, b) => b.width - a.width).slice(1);
            for (const bp of smaller) {
                if (!frame)
                    break;
                setStatus({ kind: 'capturing', at: bp.label });
                // `flex: none` as well as the width: the webview is a flex item
                // with `flex: 1 1 auto`, so grow wins over any width set on it
                // and the guest never actually narrows.
                frame.style.flex = '0 0 auto';
                frame.style.width = `${bp.width}px`;
                // Let layout settle and the page's own resize handlers run.
                await new Promise((r) => setTimeout(r, 450));
                try {
                    narrower.push({ breakpointId: bp.id, payload: await readPage() });
                }
                catch {
                    // A width that fails is one breakpoint's worth of overrides,
                    // not a failed import.
                }
            }
            if (frame) {
                frame.style.width = restoreWidth;
                frame.style.flex = restoreFlex;
            }
            setStatus({ kind: 'capturing' });
            const sent = await window.scampImport.deliver(projectPath, payload, narrower);
            if (!sent.ok) {
                setStatus({ kind: 'failed', message: sent.error ?? 'Scamp could not take the page.' });
            }
            // On success the app window answers over `onResult`.
        }
        catch (err) {
            if (frame) {
                frame.style.width = restoreWidth;
                frame.style.flex = restoreFlex;
            }
            setStatus({
                kind: 'failed',
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }, [projectPath, breakpoints]);
    const nav = (method) => () => {
        const node = webviewRef.current;
        node?.[method]?.();
    };
    const busy = status.kind === 'capturing';
    return (_jsxs("div", { className: styles.shell, children: [_jsxs("div", { className: styles.toolbar, children: [_jsx("button", { className: styles.navBtn, onClick: nav('goBack'), disabled: !canGoBack, title: "Back", children: "\u2039" }), _jsx("button", { className: styles.navBtn, onClick: nav('goForward'), disabled: !canGoForward, title: "Forward", children: "\u203A" }), _jsx("button", { className: styles.navBtn, onClick: nav('reload'), disabled: !loadedUrl, title: "Reload", children: "\u27F3" }), _jsx("input", { className: styles.urlBar, value: draftUrl, onChange: (e) => setDraftUrl(e.target.value), onKeyDown: (e) => {
                            if (e.key === 'Enter')
                                handleGo();
                        }, placeholder: "Paste a URL, then navigate to the page you want", spellCheck: false, "aria-label": "Address" }), _jsx("button", { className: styles.importBtn, onClick: () => void handleImport(), disabled: !loadedUrl || !webviewReady || busy || projectPath.length === 0, children: busy
                            ? status.kind === 'capturing' && status.at
                                ? `Reading at ${status.at}…`
                                : 'Reading the page…'
                            : 'Import' })] }), status.kind !== 'idle' && status.kind !== 'capturing' && (_jsx("div", { className: `${styles.banner} ${status.kind === 'failed' || !status.result?.ok ? styles.bannerBad : styles.bannerGood}`, children: status.kind === 'failed' ? (_jsx("span", { children: status.message })) : status.result.ok ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: styles.bannerHead, children: [_jsxs("span", { children: ["Imported ", _jsx("strong", { children: status.result.viewName }), " \u2014", ' ', status.result.elementCount, " elements"] }), (status.result.findings?.length ?? 0) > 0 && (_jsxs("button", { className: styles.reportToggle, onClick: () => setReportOpen((v) => !v), type: "button", children: [reportOpen ? 'Hide' : 'What changed', " (", status.result.findings?.length, ")"] }))] }), reportOpen && (
                        // An import is a lossy translation, and it is lossy in
                        // more than one way. Worst first, each marked with how
                        // faithfully it survived.
                        _jsx("ul", { className: styles.report, children: status.result.findings?.map((f) => (_jsxs("li", { className: REPORT_CLASS[f.fidelity](styles), children: [_jsx("span", { className: styles.reportMark, title: FIDELITY_TITLE[f.fidelity], children: FIDELITY_MARK[f.fidelity] }), _jsxs("span", { children: [f.label, f.examples.length > 0 && (_jsxs("span", { className: styles.reportWhere, children: [" \u2014 ", f.examples.join(', ')] })), f.editable !== undefined && (_jsx("span", { className: styles.reportEditable, children: f.editable }))] })] }, f.kind))) }))] })) : (_jsx("span", { children: status.result.error ?? 'The import failed.' })) })), _jsx("div", { className: styles.viewport, children: loadedUrl ? (_jsx("webview", { 
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ref: webviewRef, src: loadedUrl, className: styles.webview })) : (_jsxs("div", { className: styles.empty, children: [_jsx("p", { className: styles.emptyTitle, children: "Import a page" }), _jsxs("p", { className: styles.emptyBody, children: ["Paste a URL above and navigate to the page you want. Clicking", _jsx("strong", { children: " Import" }), " reads the page as it is on screen and makes a new view from it."] })] })) })] }));
};
