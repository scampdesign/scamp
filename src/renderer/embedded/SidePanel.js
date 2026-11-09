import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AgentTab } from './AgentTab';
import { useEmbeddedStore } from './embeddedStore';
import { HistoryTab } from './HistoryTab';
import { StyleTab } from './StyleTab';
import styles from './SidePanel.module.css';
const LABEL = { style: 'Style', history: 'History', agent: 'Agent' };
/** Style the selection; review, undo, and commit what's been done; or work with the agent. */
export const SidePanel = () => {
    const tab = useEmbeddedStore((s) => s.panelTab);
    const setTab = (next) => useEmbeddedStore.getState().set({ panelTab: next });
    // History counts what's waiting to be reviewed; Agent, what's waiting for the agent.
    const toReview = useEmbeddedStore((s) => s.git?.agentFiles.length ?? 0);
    const queued = useEmbeddedStore((s) => s.agent.queued.length);
    const badge = { style: 0, history: toReview, agent: queued };
    return (_jsxs("aside", { className: styles.panel, children: [_jsx("div", { className: styles.tabs, role: "tablist", children: ['style', 'history', 'agent'].map((t) => (_jsxs("button", { type: "button", role: "tab", "aria-selected": tab === t, className: styles.tab, onClick: () => setTab(t), "data-testid": `embedded-tab-${t}`, children: [LABEL[t], badge[t] > 0 && _jsx("span", { className: styles.badge, children: badge[t] })] }, t))) }), _jsxs("div", { className: styles.content, children: [tab === 'style' && _jsx(StyleTab, {}), tab === 'history' && _jsx(HistoryTab, {}), _jsx("div", { hidden: tab !== 'agent', className: styles.keep, children: _jsx(AgentTab, { active: tab === 'agent' }) })] })] }));
};
