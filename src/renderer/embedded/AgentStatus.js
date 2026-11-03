import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEmbeddedStore } from './embeddedStore';
import styles from './AgentStatus.module.css';
const LABEL = {
    idle: 'Agent ready',
    paused: 'Paused',
    thinking: 'Thinking…',
    writing: 'Writing code…',
    done: 'Done',
    error: 'Stopped',
};
/** What the agent is doing, and how many edits wait for it. */
export const AgentStatus = () => {
    const agent = useEmbeddedStore((s) => s.agent);
    const phase = agent.paused && agent.phase === 'idle' ? 'paused' : agent.phase;
    return (_jsxs("span", { className: styles.pill, "data-phase": phase, "data-testid": "embedded-agent-status", title: agent.message ?? agent.lastText, children: [_jsx("span", { className: styles.dot, "aria-hidden": "true" }), LABEL[phase], agent.queued.length > 0 && _jsxs("span", { className: styles.count, children: [agent.queued.length, " queued"] })] }));
};
