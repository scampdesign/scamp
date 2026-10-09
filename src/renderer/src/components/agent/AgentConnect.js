import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import styles from './AgentPanel.module.css';
/**
 * The panel's state before a key is connected — or after Anthropic stops
 * accepting it. Connecting here does what Settings → AI provider does.
 */
export const AgentConnect = ({ keyControls }) => {
    const [draft, setDraft] = useState('');
    const invalid = keyControls.status === 'invalid';
    const handleSubmit = async () => {
        if (await keyControls.connect(draft))
            setDraft('');
    };
    return (_jsxs("div", { className: styles.connect, "data-testid": "agent-connect", children: [_jsx("p", { className: styles.connectTitle, children: invalid ? 'Anthropic no longer accepts your key' : 'Connect Claude to use the agent' }), _jsx("p", { className: styles.connectHint, children: "The Scamp Agent runs on your own Anthropic account. Create a key in the Claude Console at console.anthropic.com, then paste it here. Scamp stores it encrypted on this computer." }), _jsxs("form", { className: styles.connectForm, onSubmit: (e) => {
                    e.preventDefault();
                    void handleSubmit();
                }, children: [_jsx("input", { type: "password", className: styles.connectInput, value: draft, onChange: (e) => setDraft(e.target.value), placeholder: "sk-ant-\u2026", autoComplete: "off", spellCheck: false, "aria-label": "Claude API key", disabled: keyControls.checking }), _jsx("button", { type: "submit", className: styles.primaryButton, disabled: keyControls.checking || draft.trim().length === 0, children: keyControls.checking ? 'Checking…' : 'Connect' })] }), keyControls.error !== null && (_jsx("p", { className: styles.replyError, role: "alert", children: keyControls.error }))] }));
};
