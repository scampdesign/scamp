import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { AgentStatus } from './AgentStatus';
import { useEmbeddedStore } from './embeddedStore';
import { PathField } from './PathField';
import { navigatePage, refreshTree, releaseHeld, setModes } from './session';
import styles from './AppToolbar.module.css';
/** Navigation, the edit and freeze modes, the branch, and the agent's state. */
export const AppToolbar = () => {
    const edit = useEmbeddedStore((s) => s.edit);
    const frozen = useEmbeddedStore((s) => s.frozen);
    const branch = useEmbeddedStore((s) => s.branch);
    const held = useEmbeddedStore((s) => s.held);
    const layersOpen = useEmbeddedStore((s) => s.layersOpen);
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
    return (_jsxs("header", { className: styles.bar, children: [_jsxs("div", { className: styles.nav, children: [_jsx("button", { type: "button", className: styles.icon, onClick: () => navigatePage('back'), "aria-label": "Back", children: "\u2039" }), _jsx("button", { type: "button", className: styles.icon, onClick: () => navigatePage('forward'), "aria-label": "Forward", children: "\u203A" }), _jsx("button", { type: "button", className: styles.icon, onClick: () => navigatePage('reload'), "aria-label": "Reload", children: "\u21BB" }), _jsx(PathField, {})] }), _jsxs("div", { className: styles.modes, children: [_jsx("button", { type: "button", className: styles.toggle, "aria-pressed": layersOpen, onClick: () => {
                            useEmbeddedStore.getState().set({ layersOpen: !layersOpen });
                            if (!layersOpen)
                                void refreshTree();
                        }, title: "Show the page's elements as a tree", "data-testid": "embedded-layers-toggle", children: "Layers" }), _jsx("button", { type: "button", className: styles.toggle, "aria-pressed": edit, onClick: () => setModes({ edit: !edit }), title: "Click elements to select and style them. Turn off to use the app.", "data-testid": "embedded-edit-toggle", children: "Edit" }), _jsx("button", { type: "button", className: styles.toggle, "aria-pressed": frozen, onClick: () => setModes({ frozen: !frozen }), title: "Keep menus, popovers and tooltips open while you select and style them (F8, with the pointer still on the page).", "data-testid": "embedded-freeze-toggle", children: "Freeze" }), held.length > 0 && (_jsxs("span", { className: styles.held, "data-testid": "embedded-held", title: held.map((h) => `${h.label} :${h.states.join(' :')}`).join('\n'), children: ["Holding :", held[0]?.states[0], " on ", held[0]?.label, held.length > 1 ? ` +${held.length - 1}` : '', _jsx("button", { type: "button", className: styles.release, onClick: releaseHeld, "data-testid": "embedded-release", children: "Release" })] }))] }), _jsxs("div", { className: styles.status, children: [branch !== null && _jsx("span", { className: styles.branch, title: "Your work happens on this branch", children: branch }), _jsx(AgentStatus, {})] })] }));
};
