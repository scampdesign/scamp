import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useRef } from 'react';
import { OWN_AGENT_LINE } from '@shared/embedded';
import { TerminalView } from '../src/components/TerminalView';
import { useEmbeddedStore } from './embeddedStore';
import styles from './AgentTerminal.module.css';
/**
 * A terminal in the project's folder, beside the agent choice, so starting
 * the user's own agent and giving it the line happens without leaving Scamp.
 */
export const AgentTerminal = () => {
    const folder = useEmbeddedStore((s) => s.folder);
    const write = useRef(null);
    // Stable, so the terminal isn't recreated on every render.
    const handleReady = useCallback((typeInto) => {
        write.current = typeInto;
    }, []);
    if (folder === null)
        return null;
    return (_jsxs("div", { className: styles.wrap, children: [_jsxs("div", { className: styles.actions, children: [_jsx("button", { type: "button", className: styles.action, onClick: () => write.current?.('claude\r'), "data-testid": "embedded-terminal-start-claude", children: "Start Claude Code" }), _jsx("button", { type: "button", className: styles.action, onClick: () => write.current?.(OWN_AGENT_LINE), "data-testid": "embedded-terminal-paste", children: "Paste the prompt" })] }), _jsx("div", { className: styles.terminal, "data-testid": "embedded-terminal", children: _jsx(TerminalView, { cwd: folder, api: window.scampEmbedded, onReady: handleReady }) }), _jsx("p", { className: styles.hint, children: "Using another agent? Start it here instead, then paste the prompt and press Enter." })] }));
};
