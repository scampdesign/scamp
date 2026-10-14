import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useIsSignedIn } from '@store/authSlice';
import { useAgentKey } from './agent/useAgentKey';
import settingsStyles from './SettingsPage.module.css';
import styles from './AiProviderSection.module.css';
/**
 * Connect the user's own Claude API key for the Scamp Agent.
 *
 * Signed-in users only, and invisible otherwise — no teaser during the
 * beta. The key leaves this component on submit and is never read back:
 * main only ever answers with a status.
 * see docs/archive/2026-10-06-builtin-agent-plan.md
 */
const STATUS_TEXT = {
    connected: 'Connected',
    'session-only': 'Connected for this session',
    invalid: 'Anthropic no longer accepts the saved key',
    'not-connected': 'Not connected',
};
export const AiProviderSection = () => {
    const signedIn = useIsSignedIn();
    const { status, checking, error, connect, disconnect } = useAgentKey(signedIn);
    const [draft, setDraft] = useState('');
    if (!signedIn || status === null)
        return null;
    const handleConnect = async () => {
        if (await connect(draft))
            setDraft('');
    };
    const handleDisconnect = async () => {
        await disconnect();
    };
    const connected = status === 'connected' || status === 'session-only';
    return (_jsxs("div", { className: settingsStyles.section, children: [_jsx("h2", { className: settingsStyles.sectionTitle, children: "AI provider" }), _jsxs("div", { className: settingsStyles.row, children: [_jsxs("div", { className: settingsStyles.rowLabel, children: [_jsx("div", { children: "Claude API key" }), _jsx("div", { className: settingsStyles.rowHint, children: "The Scamp Agent runs on your own Anthropic account. Create a key in the Claude Console at console.anthropic.com, then paste it here. Scamp stores it encrypted on this computer. When you send a message, Scamp sends Anthropic your message and the parts of your design the agent reads." })] }), _jsxs("div", { className: `${settingsStyles.rowControl} ${styles.control}`, children: [_jsx("span", { className: `${styles.status} ${connected ? styles.statusOk : ''} ${status === 'invalid' ? styles.statusError : ''}`, "data-testid": "ai-provider-status", children: STATUS_TEXT[status] }), connected ? (_jsx("button", { type: "button", className: settingsStyles.smallButton, onClick: () => void handleDisconnect(), children: "Disconnect" })) : (_jsxs("form", { className: styles.form, onSubmit: (e) => {
                                    e.preventDefault();
                                    void handleConnect();
                                }, children: [_jsx("input", { type: "password", className: styles.input, value: draft, onChange: (e) => setDraft(e.target.value), placeholder: "sk-ant-\u2026", autoComplete: "off", spellCheck: false, "aria-label": "Claude API key", disabled: checking }), _jsx("button", { type: "submit", className: settingsStyles.smallButton, disabled: checking || draft.trim().length === 0, children: checking ? 'Checking…' : 'Connect' })] }))] })] }), status === 'session-only' && (_jsx("p", { className: styles.note, children: "Your system can\u2019t encrypt the key, so Scamp keeps it only until you quit. Paste it again the next time you open Scamp." })), error !== null && (_jsx("p", { className: styles.error, role: "alert", children: error }))] }));
};
