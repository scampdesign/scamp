import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import styles from './CheckRow.module.css';
const MARK = { pass: '✓', warn: '!', fail: '✕', action: '→' };
/** One line of the setup screen: what Scamp checked, and a fix when it has one. */
export const CheckRow = ({ check, onFix }) => {
    const [key, setKey] = useState('');
    const [busy, setBusy] = useState(false);
    const handleFix = async (value) => {
        if (check.fix === undefined)
            return;
        setBusy(true);
        await onFix(check.fix, value);
        setBusy(false);
    };
    return (_jsxs("li", { className: styles.row, "data-status": check.status, "data-check": check.id, children: [_jsx("span", { className: styles.mark, "aria-hidden": "true", children: MARK[check.status] }), _jsxs("div", { className: styles.body, children: [_jsx("div", { className: styles.label, children: check.label }), _jsx("div", { className: styles.detail, children: check.detail }), check.fix === 'git-init' && (_jsx("button", { type: "button", className: styles.fix, disabled: busy, onClick: () => void handleFix(), children: "Initialize git" })), check.fix === 'sign-in' && (_jsx("button", { type: "button", className: styles.fix, disabled: busy, onClick: () => void handleFix(), children: "Sign in" })), check.fix === 'connect-agent' && (_jsxs("form", { className: styles.keyForm, onSubmit: (e) => {
                            e.preventDefault();
                            void handleFix(key);
                        }, children: [_jsx("input", { className: styles.keyInput, type: "password", placeholder: "sk-ant-\u2026", value: key, onChange: (e) => setKey(e.target.value), "aria-label": "Anthropic API key" }), _jsx("button", { type: "submit", className: styles.fix, disabled: busy || key.trim().length === 0, children: "Connect" })] }))] })] }));
};
