import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { AgentMarkdown } from '../src/components/agent/AgentMarkdown';
import { useEmbeddedStore } from './embeddedStore';
import { sendInstruction, undoTurn } from './session';
import styles from './AgentChat.module.css';
const STATUS = { running: 'Working…', error: 'Stopped with an error', stopped: 'Stopped', undone: 'Undone' };
/**
 * The conversation with the agent: each batch it took, what it said and
 * did, and an undo per turn; a reply goes in the queue like an instruction.
 * see docs/plans/embedded-canvas-gaps.md (gap 13)
 */
export const AgentChat = () => {
    const chat = useEmbeddedStore((s) => s.chat);
    const paused = useEmbeddedStore((s) => s.agent.paused);
    const [reply, setReply] = useState('');
    const handleSend = async () => {
        await sendInstruction(reply);
        setReply('');
    };
    return (_jsxs("div", { className: styles.chat, "data-testid": "embedded-chat", children: [chat.length === 0 && _jsx("p", { className: styles.empty, children: "Your edits and the agent\u2019s replies appear here as it works." }), chat.map((turn) => turn.role === 'user' ? (_jsx("div", { className: styles.user, children: turn.lines.map((line, i) => (_jsx("p", { children: line }, i))) }, turn.id)) : (_jsxs("div", { className: styles.agent, "data-status": turn.status, "data-testid": "embedded-chat-agent", children: [turn.text.trim().length > 0 && _jsx(AgentMarkdown, { text: turn.text.trim() }), turn.tools.length > 0 && (_jsxs("details", { className: styles.tools, children: [_jsx("summary", { children: turn.tools.length === 1 ? '1 step' : `${turn.tools.length} steps` }), turn.tools.map((tool, i) => (_jsx("p", { "data-ok": tool.ok, children: tool.text }, i)))] })), _jsxs("div", { className: styles.foot, children: [STATUS[turn.status] !== undefined && _jsx("span", { className: styles.status, children: turn.message ?? STATUS[turn.status] }), turn.runId !== undefined && turn.status !== 'undone' && turn.status !== 'running' && (_jsx("button", { type: "button", className: styles.undo, onClick: () => void undoTurn(turn.runId ?? ''), "data-testid": "embedded-chat-undo", children: "Undo" }))] })] }, turn.id))), _jsx("form", { className: styles.reply, onSubmit: (e) => {
                    e.preventDefault();
                    void handleSend();
                }, children: _jsx("textarea", { className: styles.input, value: reply, onChange: (e) => setReply(e.target.value), onKeyDown: (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void handleSend();
                        }
                    }, placeholder: paused ? 'Reply to the agent. It runs when you resume.' : 'Reply to the agent', rows: 2, "data-testid": "embedded-chat-reply" }) })] }));
};
