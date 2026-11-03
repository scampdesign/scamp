import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { AgentStatus } from './AgentStatus';
import { useEmbeddedStore } from './embeddedStore';
import { navigatePage, openPath, setModes } from './session';
import styles from './AppToolbar.module.css';
const pathOf = (url) => {
    if (url === null)
        return '/';
    try {
        const u = new URL(url);
        return `${u.pathname}${u.search}${u.hash}`;
    }
    catch {
        return '/';
    }
};
/** Navigation, the edit and freeze modes, the branch, and the agent's state. */
export const AppToolbar = () => {
    const pageUrl = useEmbeddedStore((s) => s.pageUrl);
    const edit = useEmbeddedStore((s) => s.edit);
    const frozen = useEmbeddedStore((s) => s.frozen);
    const branch = useEmbeddedStore((s) => s.branch);
    const [draft, setDraft] = useState(pathOf(pageUrl));
    useEffect(() => setDraft(pathOf(pageUrl)), [pageUrl]);
    // F8 freezes from here too; inside the page, the inspector answers it.
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key !== 'F8' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey)
                return;
            e.preventDefault();
            setModes({ frozen: !useEmbeddedStore.getState().frozen });
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);
    return (_jsxs("header", { className: styles.bar, children: [_jsxs("div", { className: styles.nav, children: [_jsx("button", { type: "button", className: styles.icon, onClick: () => navigatePage('back'), "aria-label": "Back", children: "\u2039" }), _jsx("button", { type: "button", className: styles.icon, onClick: () => navigatePage('forward'), "aria-label": "Forward", children: "\u203A" }), _jsx("button", { type: "button", className: styles.icon, onClick: () => navigatePage('reload'), "aria-label": "Reload", children: "\u21BB" }), _jsx("form", { className: styles.urlForm, onSubmit: (e) => {
                            e.preventDefault();
                            openPath(draft);
                        }, children: _jsx("input", { className: styles.url, value: draft, onChange: (e) => setDraft(e.target.value), "aria-label": "Page path", "data-testid": "embedded-path" }) })] }), _jsxs("div", { className: styles.modes, children: [_jsx("button", { type: "button", className: styles.toggle, "aria-pressed": edit, onClick: () => setModes({ edit: !edit }), title: "Click elements to select and style them. Turn off to use the app.", "data-testid": "embedded-edit-toggle", children: "Edit" }), _jsx("button", { type: "button", className: styles.toggle, "aria-pressed": frozen, onClick: () => setModes({ frozen: !frozen }), title: "Keep menus, popovers and tooltips open while you select and style them (F8, with the pointer still on the page).", "data-testid": "embedded-freeze-toggle", children: "Freeze" })] }), _jsxs("div", { className: styles.status, children: [branch !== null && _jsx("span", { className: styles.branch, title: "Your work happens on this branch", children: branch }), _jsx(AgentStatus, {})] })] }));
};
