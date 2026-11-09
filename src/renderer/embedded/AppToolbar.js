import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { IconGitBranch } from '@tabler/icons-react';
import { Tooltip } from '../src/components/controls/Tooltip';
import { AgentStatus } from './AgentStatus';
import { useEmbeddedStore } from './embeddedStore';
import { releaseHeld, setModes } from './session';
import styles from './AppToolbar.module.css';
// macOS draws its window buttons over the bar's left end.
const MAC = navigator.userAgent.includes('Macintosh');
/** The title bar, as the scamp-ui Layout design: the project and its branch, then the agent. */
export const AppToolbar = () => {
    const held = useEmbeddedStore((s) => s.held);
    const toast = useEmbeddedStore((s) => s.toast);
    const name = useEmbeddedStore((s) => s.preflight?.name ?? s.folder?.split(/[\\/]/).pop() ?? 'Project');
    const branch = useEmbeddedStore((s) => s.branch);
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
    return (_jsxs("header", { className: styles.bar, "data-mac": MAC, children: [_jsxs("div", { className: styles.project, children: [_jsx("p", { className: styles.name, children: name }), branch !== null && (
                    // The branch, muted; a click opens History, where branches are switched, pushed, and pulled.
                    _jsx(Tooltip, { label: "Branch \u2014 Your work happens on this branch. Click to switch branches, push, or pull.", children: _jsxs("button", { type: "button", className: styles.branch, onClick: () => useEmbeddedStore.getState().set({ panelTab: 'history' }), "data-testid": "embedded-branch", children: [_jsx(IconGitBranch, { className: styles.branchIcon, "aria-hidden": "true" }), branch] }) }))] }), _jsxs("div", { className: styles.group, children: [toast !== null && (_jsx("span", { className: styles.toast, role: "status", "data-testid": "embedded-toast", children: toast })), held.length > 0 && (_jsx(Tooltip, { label: `Holding — ${held.map((h) => `${h.label} :${h.states.join(' :')}`).join('\n')}`, children: _jsxs("span", { className: styles.held, "data-testid": "embedded-held", children: ["Holding :", held[0]?.states[0], " on ", held[0]?.label, held.length > 1 ? ` +${held.length - 1}` : '', _jsx("button", { type: "button", className: styles.release, onClick: releaseHeld, "data-testid": "embedded-release", children: "Release" })] }) })), _jsx(AgentStatus, {})] })] }));
};
