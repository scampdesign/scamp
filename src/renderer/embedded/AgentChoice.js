import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { OWN_AGENT_LINE } from '@shared/embedded';
import { AgentTerminal } from './AgentTerminal';
import styles from './AgentChoice.module.css';
const POLL_MS = 2000;
/**
 * Who writes the changes: the Scamp Agent (an API key), or the user's own
 * agent (Claude Code and others) over Scamp's MCP server, signed in as it
 * already is. see docs/plans/embedded-agent-connection-plan.md
 */
export const AgentChoice = () => {
    const [status, setStatus] = useState(null);
    const [copied, setCopied] = useState(null);
    const worker = status?.worker ?? 'scamp';
    useEffect(() => {
        let cancelled = false;
        const load = () => {
            void window.scampEmbedded.ownAgentStatus().then((next) => {
                if (!cancelled)
                    setStatus(next);
            });
        };
        load();
        // Whether the user's agent has connected changes outside this window: ask again.
        const timer = setInterval(load, POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, []);
    const handleChoose = async (next) => {
        setStatus(await window.scampEmbedded.setWorker(next));
    };
    const handleCopy = async (text) => {
        await navigator.clipboard.writeText(text);
        setCopied(text);
        setTimeout(() => setCopied(null), 1500);
    };
    return (_jsxs("div", { className: styles.choice, children: [_jsxs("div", { className: styles.toggle, role: "group", "aria-label": "Who writes your changes", children: [_jsx("button", { type: "button", "aria-pressed": worker === 'scamp', onClick: () => void handleChoose('scamp'), "data-testid": "embedded-worker-scamp", children: "Scamp Agent" }), _jsx("button", { type: "button", "aria-pressed": worker === 'own', onClick: () => void handleChoose('own'), "data-testid": "embedded-worker-own", children: "My agent" })] }), worker === 'own' && status !== null && (_jsxs("div", { className: styles.own, "data-testid": "embedded-own-agent", children: [_jsx("p", { className: styles.state, "data-state": status.working ? 'working' : status.seen ? 'connected' : 'waiting', children: status.working
                            ? 'Your agent is writing changes.'
                            : status.seen
                                ? 'Your agent is connected.'
                                : 'Waiting for your agent to connect.' }), !status.seen && (_jsxs("ol", { className: styles.steps, children: [_jsxs("li", { children: ["In the terminal below, click ", _jsx("strong", { children: "Start Claude Code" }), ", or start another agent", status.written.length > 0 ? ` (Scamp set up ${status.written.join(', ')})` : '', ". If it asks to use the", ' ', _jsx("code", { children: "scamp" }), " server, allow it."] }), _jsxs("li", { children: ["Click ", _jsx("strong", { children: "Paste the prompt" }), " and press Enter, or tell it:", _jsxs("span", { className: styles.copyRow, children: [_jsx("code", { className: styles.line, children: OWN_AGENT_LINE }), _jsx("button", { type: "button", className: styles.copy, onClick: () => void handleCopy(OWN_AGENT_LINE), children: copied === OWN_AGENT_LINE ? 'Copied' : 'Copy' })] })] })] })), _jsx(AgentTerminal, {}), status.skipped.length > 0 && status.command !== null && (_jsxs("div", { className: styles.manual, children: [_jsxs("p", { children: ["Scamp didn\u2019t change ", status.skipped.map((s) => s.path).join(', '), ": ", status.skipped[0]?.reason, ". To connect Claude Code yourself, run this in the project\u2019s folder:"] }), _jsxs("span", { className: styles.copyRow, children: [_jsx("code", { className: styles.line, children: status.command }), _jsx("button", { type: "button", className: styles.copy, onClick: () => void handleCopy(status.command ?? ''), children: copied === status.command ? 'Copied' : 'Copy' })] })] }))] }))] }));
};
