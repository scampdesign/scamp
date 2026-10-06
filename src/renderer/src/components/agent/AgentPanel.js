import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { IconArrowBackUp, IconMessagePlus, IconPlayerStop, IconSend } from '@tabler/icons-react';
import { currentAgentContext, currentConversationKey, sameConversation, useAgentStore } from '@store/agentSlice';
import { useCanvasStore } from '@store/canvasSlice';
import { Tooltip } from '../controls/Tooltip';
import { AgentCleanupCard } from './AgentCleanupCard';
import { AgentConnect } from './AgentConnect';
import { AgentPlanBar } from './AgentPlanBar';
import { AgentReply } from './AgentReply';
import { ReactTidyCard } from './ReactTidyCard';
import { useAgentKey } from './useAgentKey';
import styles from './AgentPanel.module.css';
/**
 * The Scamp Agent, in the left sidebar. Signed-in users only — the rail
 * doesn't offer it otherwise.
 * see docs/plans/builtin-agent-plan.md
 */
/** Starting points, which change with what's selected. */
const SUGGESTIONS_WITH_SELECTION = [
    'What styles does this element have?',
    'Center this element’s contents',
    'Use theme tokens for this element’s colors',
];
const SUGGESTIONS_WITHOUT_SELECTION = [
    'What’s on this page?',
    'Which elements don’t use theme tokens?',
    'What did this page lose when it was imported?',
];
const SUGGESTIONS_FOR_PROJECT = [
    'Which pages don’t follow the project’s conventions?',
    'Which colors repeat without a theme token?',
    'Which designs repeat and could be components?',
];
const FOCUS_LABELS = {
    selection: 'Selection',
    page: 'Whole page',
    project: 'Whole project',
};
export const AgentPanel = () => {
    const keyControls = useAgentKey(true);
    const projectPath = useCanvasStore((s) => s.projectPath);
    const hasSelection = useCanvasStore((s) => s.selectedElementIds.length > 0);
    const { entries, busy, sendError, send, cancel, reset, edited, undoSession, lastImport, cleanupPhase, cleanupConversation, conversation, openConversation, focus, setFocus, reactImport, } = useAgentStore();
    // Recomputed from the canvas on every store change; a string, so the
    // panel only re-renders when the line actually changes.
    const context = useCanvasStore(() => currentAgentContext(focus));
    // A string for the same reason: the page, view or component open now.
    const openKeyId = useCanvasStore(() => {
        const key = currentConversationKey();
        return key === null ? null : `${key.kind}:${key.name}`;
    });
    const openViewName = useCanvasStore((s) => s.activeComponent?.name ?? null);
    // Offered for the view imported most recently, while it's the one open.
    const cleanupOffer = lastImport !== null && lastImport.projectPath === projectPath && lastImport.viewName === openViewName
        ? lastImport
        : null;
    const [confirmingUndo, setConfirmingUndo] = useState(false);
    const [undoError, setUndoError] = useState(null);
    const conversationProject = useAgentStore((s) => s.projectPath);
    const openKey = currentConversationKey();
    const showing = conversationProject === projectPath && sameConversation(conversation, openKey);
    const visible = showing ? entries : [];
    // Each page, view and component has its own conversation: going to one
    // opens its conversation, read back from disk.
    useEffect(() => {
        const key = currentConversationKey();
        if (projectPath === null || key === null)
            return;
        const agent = useAgentStore.getState();
        if (agent.projectPath === projectPath && sameConversation(agent.conversation, key))
            return;
        void agent.openConversation(projectPath, key);
    }, [projectPath, openKeyId]);
    const [draft, setDraft] = useState('');
    const listRef = useRef(null);
    useEffect(() => {
        const list = listRef.current;
        if (list !== null)
            list.scrollTop = list.scrollHeight;
    }, [visible]);
    const connected = keyControls.status === 'connected' || keyControls.status === 'session-only';
    const handleSend = (text) => {
        if (text.trim().length === 0 || busy)
            return;
        void send(text);
        setDraft('');
    };
    const handleUndo = async () => {
        const result = await undoSession();
        setConfirmingUndo(false);
        setUndoError(result.ok ? null : result.error);
    };
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSend(draft);
        }
    };
    return (_jsxs("section", { className: styles.panel, "data-testid": "agent-panel", "aria-label": "Scamp Agent", children: [_jsxs("header", { className: styles.header, children: [_jsxs("h2", { className: styles.title, children: ["Agent ", _jsx("span", { className: styles.beta, children: "Beta" })] }), connected && (_jsxs("div", { className: styles.headerActions, children: [edited && (_jsx(Tooltip, { label: "Undo AI changes", children: _jsx("button", { type: "button", className: styles.iconButton, onClick: () => setConfirmingUndo(true), disabled: busy || confirmingUndo, "aria-label": "Undo AI changes", children: _jsx(IconArrowBackUp, { size: 14 }) }) })), _jsx(Tooltip, { label: "New conversation", children: _jsx("button", { type: "button", className: styles.iconButton, onClick: () => void reset(), disabled: visible.length === 0, "aria-label": "New conversation", children: _jsx(IconMessagePlus, { size: 14 }) }) })] }))] }), confirmingUndo && (_jsxs("div", { className: styles.confirm, role: "alertdialog", "aria-label": "Undo AI changes", "data-testid": "agent-undo-confirm", children: [_jsx("p", { className: styles.confirmText, children: "Undo every change the agent made in this conversation? Pages, components, the theme, and DESIGN.md go back to how they were before its first edit." }), _jsxs("div", { className: styles.confirmActions, children: [_jsx("button", { type: "button", className: styles.secondaryButton, onClick: () => setConfirmingUndo(false), children: "Keep changes" }), _jsx("button", { type: "button", className: styles.primaryButton, onClick: () => void handleUndo(), children: "Undo changes" })] })] })), undoError !== null && (_jsx("p", { className: `${styles.replyError} ${styles.bannerError}`, role: "alert", children: undoError })), keyControls.status === null ? null : !connected ? (_jsx(AgentConnect, { keyControls: keyControls })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: styles.messages, ref: listRef, "data-testid": "agent-messages", children: [visible.length === 0 &&
                                reactImport !== null &&
                                reactImport.projectPath === projectPath &&
                                openViewName !== null &&
                                reactImport.views.includes(openViewName) ? (_jsx(ReactTidyCard, { viewName: openViewName, appName: reactImport.appName })) : visible.length === 0 && cleanupOffer !== null ? (_jsx(AgentCleanupCard, { projectPath: cleanupOffer.projectPath, viewName: cleanupOffer.viewName })) : visible.length === 0 ? (_jsxs("div", { className: styles.empty, children: [_jsx("p", { className: styles.emptyText, children: "Ask about the page you\u2019re designing, or ask for a change. Each reply\u2019s edits undo together with Cmd+Z." }), _jsx("ul", { className: styles.suggestions, children: (focus === 'project'
                                            ? SUGGESTIONS_FOR_PROJECT
                                            : hasSelection && focus === 'selection'
                                                ? SUGGESTIONS_WITH_SELECTION
                                                : SUGGESTIONS_WITHOUT_SELECTION).map((s) => (_jsx("li", { children: _jsx("button", { type: "button", className: styles.suggestion, onClick: () => handleSend(s), children: s }) }, s))) })] })) : (visible.map((entry) => entry.role === 'user' ? (_jsx("div", { className: styles.userMessage, "data-testid": "agent-user-message", children: entry.text }, entry.id)) : entry.role === 'note' ? (_jsx("p", { className: styles.note, "data-testid": "agent-note", children: entry.text }, entry.id)) : (_jsx(AgentReply, { entry: entry }, entry.id)))), cleanupPhase === 'awaiting-approval' && !busy && sameConversation(cleanupConversation, openKey) && (_jsx(AgentPlanBar, {}))] }), _jsxs("footer", { className: styles.composer, children: [_jsxs("div", { className: styles.contextRow, children: [_jsx("p", { className: styles.context, "data-testid": "agent-context", title: context, children: context.length > 0 ? context : 'No page open' }), _jsx("select", { className: styles.focusSelect, value: focus, onChange: (e) => setFocus(e.target.value), "aria-label": "What the agent considers", children: Object.keys(FOCUS_LABELS).map((value) => (_jsx("option", { value: value, children: FOCUS_LABELS[value] }, value))) })] }), sendError !== null && (_jsx("p", { className: styles.replyError, role: "alert", children: sendError })), _jsxs("div", { className: styles.inputRow, children: [_jsx("textarea", { className: styles.input, value: draft, onChange: (e) => setDraft(e.target.value), onKeyDown: handleKeyDown, placeholder: "Ask or describe a change\u2026", rows: 3, "aria-label": "Message the agent" }), busy ? (_jsx(Tooltip, { label: "Stop", children: _jsx("button", { type: "button", className: styles.sendButton, onClick: cancel, "aria-label": "Stop", children: _jsx(IconPlayerStop, { size: 14 }) }) })) : (_jsx(Tooltip, { label: "Send", children: _jsx("button", { type: "button", className: styles.sendButton, onClick: () => handleSend(draft), disabled: draft.trim().length === 0, "aria-label": "Send", children: _jsx(IconSend, { size: 14 }) }) }))] })] })] }))] }));
};
