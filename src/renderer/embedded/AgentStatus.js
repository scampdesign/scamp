import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Tooltip } from '../src/components/controls/Tooltip';
import { useEmbeddedStore } from './embeddedStore';
import styles from './AgentStatus.module.css';
const LABEL = {
    idle: 'Agent Ready',
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
    const pill = (_jsxs("span", { className: styles.status, "data-phase": phase, "data-testid": "embedded-agent-status", children: [_jsx("span", { className: styles.dot, "aria-hidden": "true" }), LABEL[phase], agent.queued.length > 0 && _jsxs("span", { className: styles.count, children: [agent.queued.length, " queued"] })] }));
    // What the agent last said, or why it stopped; nothing to show before its first run.
    const detail = agent.message ?? agent.lastText;
    return detail.length > 0 ? _jsx(Tooltip, { label: `Agent — ${detail}`, children: pill }) : pill;
};
