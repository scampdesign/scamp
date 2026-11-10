import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { describeChange } from '@shared/embedded';
import { Tooltip } from '../src/components/controls/Tooltip';
import { AgentChat } from './AgentChat';
import { AgentChoice } from './AgentChoice';
import { DesignCheck } from './DesignCheck';
import { useEmbeddedStore } from './embeddedStore';
import { removeQueued } from './session';
import styles from './Tabs.module.css';
/** Everything about the agent: who it is and how it connects, what it's working on, and design checks. */
export const AgentTab = ({ active }) => {
    const agent = useEmbeddedStore((s) => s.agent);
    const startLog = useEmbeddedStore((s) => s.startLog);
    const running = agent.phase === 'thinking' || agent.phase === 'writing';
    return (_jsxs("div", { className: styles.tab, "data-active": active, children: [_jsxs("section", { className: styles.section, children: [_jsx("h3", { className: styles.title, children: "Agent" }), _jsx(AgentChoice, {})] }), _jsxs("section", { className: styles.section, children: [_jsx("h3", { className: styles.title, children: "Queue" }), _jsxs("div", { className: styles.row, children: [_jsx("button", { type: "button", className: styles.button, "aria-pressed": agent.paused, onClick: () => void window.scampEmbedded.setPaused(!agent.paused), "data-testid": "embedded-pause", children: agent.paused ? 'Resume' : 'Pause' }), _jsx("button", { type: "button", className: styles.button, disabled: agent.queued.length === 0 || running, onClick: () => void window.scampEmbedded.runNow(), "data-testid": "embedded-run-now", children: "Run now" }), running && (_jsx("button", { type: "button", className: styles.button, onClick: () => void window.scampEmbedded.cancel(), children: "Stop" }))] }), agent.message !== undefined && _jsx("p", { className: styles.note, children: agent.message }), agent.queued.length === 0 ? (_jsx("p", { className: styles.empty, children: agent.paused ? 'Paused. Edits wait here until you resume or run them.' : 'Edits you make go to the agent here.' })) : (_jsx("ul", { className: styles.list, "data-testid": "embedded-queue", children: agent.queued.map((item) => (_jsxs("li", { className: styles.item, children: [_jsx(Tooltip, { label: describeChange(item).detail || describeChange(item).text, children: _jsx("span", { className: styles.itemText, children: describeChange(item).text }) }), _jsx("button", { type: "button", className: styles.remove, onClick: () => void removeQueued(item.id), "aria-label": "Remove from queue", children: "\u2715" })] }, item.id))) }))] }), _jsxs("section", { className: styles.section, children: [_jsx("h3", { className: styles.title, children: "Conversation" }), _jsx(AgentChat, {})] }), startLog.length > 0 && (_jsxs("details", { className: styles.log, "data-testid": "embedded-server-output", children: [_jsx("summary", { children: "Dev server output" }), _jsx("pre", { className: styles.serverOutput, children: startLog })] })), _jsxs("section", { className: styles.section, children: [_jsx("h3", { className: styles.title, children: "Design check" }), _jsx(DesignCheck, {})] })] }));
};
