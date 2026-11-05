import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { ChangesTab } from './ChangesTab';
import { ChecksTab } from './ChecksTab';
import { useEmbeddedStore } from './embeddedStore';
import { StyleTab } from './StyleTab';
import styles from './SidePanel.module.css';
/** Style the selection, review and commit what the agent wrote, or check the design. */
export const SidePanel = () => {
    const [tab, setTab] = useState('style');
    const waiting = useEmbeddedStore((s) => s.agent.queued.length + (s.git?.agentFiles.length ?? 0));
    return (_jsxs("aside", { className: styles.panel, children: [_jsx("div", { className: styles.tabs, role: "tablist", children: ['style', 'changes', 'checks'].map((t) => (_jsxs("button", { type: "button", role: "tab", "aria-selected": tab === t, className: styles.tab, onClick: () => setTab(t), "data-testid": `embedded-tab-${t}`, children: [t === 'style' ? 'Style' : t === 'changes' ? 'Changes' : 'Checks', t === 'changes' && waiting > 0 && _jsx("span", { className: styles.badge, children: waiting })] }, t))) }), _jsxs("div", { className: styles.content, children: [tab === 'style' && _jsx(StyleTab, {}), tab === 'changes' && _jsx(ChangesTab, {}), tab === 'checks' && _jsx(ChecksTab, {})] })] }));
};
