import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { IconCheck, IconCopy, IconLoader2, IconX } from '@tabler/icons-react';
import { formatUsage, replyText, toolLabel, } from '@lib/agentTranscript';
import { Tooltip } from '../controls/Tooltip';
import { AgentMarkdown } from './AgentMarkdown';
import styles from './AgentPanel.module.css';
/** What a turn that didn't simply finish has to say for itself. */
const OUTCOME_NOTE = {
    cancelled: 'Stopped.',
    refusal: 'Claude declined this request.',
};
const ConfirmCard = ({ part, }) => {
    const answer = (approved) => {
        void window.scamp.agentConfirm({ confirmId: part.id, approved });
    };
    return (_jsxs("div", { className: styles.confirmCard, "data-testid": "agent-confirm", "data-state": part.state, children: [_jsx("p", { className: styles.confirmText, children: part.state === 'pending'
                    ? 'The agent wants to make these changes:'
                    : part.state === 'approved'
                        ? 'You approved these changes:'
                        : 'You declined these changes:' }), _jsx("ul", { className: styles.confirmItems, children: part.items.map((item, i) => (_jsx("li", { children: item }, i))) }), part.state === 'pending' && (_jsxs("div", { className: styles.confirmActions, children: [_jsx("button", { type: "button", className: styles.secondaryButton, onClick: () => answer(false), children: "Cancel" }), _jsx("button", { type: "button", className: styles.primaryButton, onClick: () => answer(true), children: "Apply changes" })] }))] }));
};
/** One reply: its text and tool calls in order, then how it ended. */
export const AgentReply = ({ entry }) => {
    const working = entry.status === 'working';
    const text = replyText(entry);
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied)
            return;
        const timer = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(timer);
    }, [copied]);
    const handleCopy = () => {
        void window.scamp
            .writeClipboard({ text })
            // Only claim success when the write actually happened.
            .then(() => setCopied(true))
            .catch(() => undefined);
    };
    const asking = entry.parts.some((part) => part.kind === 'confirm' && part.state === 'pending');
    const note = entry.message ?? OUTCOME_NOTE[entry.status];
    return (_jsxs("div", { className: styles.reply, "data-testid": "agent-reply", "data-status": entry.status, children: [entry.parts.map((part, i) => part.kind === 'text' ? (_jsx(AgentMarkdown, { text: part.text }, i)) : part.kind === 'confirm' ? (_jsx(ConfirmCard, { part: part }, part.id)) : (_jsx("ul", { className: styles.tools, children: part.calls.map((call) => (_jsxs("li", { className: styles.tool, "data-testid": "agent-tool", children: [call.status === 'running' ? (_jsx(IconLoader2, { size: 12, className: styles.spin, "aria-hidden": true })) : call.status === 'ok' ? (_jsx(IconCheck, { size: 12, "aria-hidden": true })) : (_jsx(IconX, { size: 12, "aria-hidden": true })), call.summary ?? toolLabel(call.name)] }, call.id))) }, i))), working && (_jsx("p", { className: styles.progress, "aria-live": "polite", children: asking
                    ? 'Waiting for your answer.'
                    : entry.progress.trim().length > 0
                        ? entry.progress.trim()
                        : 'Thinking…' })), !working && note !== undefined && entry.status !== 'done' && (_jsx("p", { className: entry.status === 'error' ? styles.replyError : styles.replyNote, role: "status", children: note })), !working && (entry.usage !== undefined || text.length > 0) && (_jsxs("div", { className: styles.replyFooter, children: [entry.usage !== undefined && _jsx("p", { className: styles.usage, children: formatUsage(entry.usage) }), text.length > 0 && (_jsx(Tooltip, { label: copied ? 'Copied' : 'Copy reply', children: _jsx("button", { type: "button", className: styles.iconButton, onClick: handleCopy, "aria-label": "Copy reply", "data-testid": "agent-copy-reply", children: copied ? _jsx(IconCheck, { size: 14 }) : _jsx(IconCopy, { size: 14 }) }) }))] }))] }));
};
