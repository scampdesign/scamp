import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useDialogBackdrop } from '../../hooks/useDialogBackdrop';
import { Button } from '../controls/Button';
import dialogStyles from '../ConfirmDialog.module.css';
import styles from './ReactImportDialog.module.css';
/** Lines of the dev server's output kept for the dialog. */
const LOG_LINES = 8;
/** An address the import window can open, or null. */
const asAppUrl = (raw) => {
    const trimmed = raw.trim();
    if (trimmed.length === 0)
        return null;
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    try {
        const url = new URL(withScheme);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    }
    catch {
        return null;
    }
};
/**
 * Import a React app: choose its folder and let Scamp run its dev server,
 * or give the address of one already running. Nothing runs until the
 * user has seen the exact commands and said yes.
 * see docs/plans/react-import-plan.md
 */
export const ReactImportDialog = ({ projectPath, onReady, onClose }) => {
    const [step, setStep] = useState({ kind: 'choose' });
    const [address, setAddress] = useState('');
    const [log, setLog] = useState([]);
    const starting = step.kind === 'starting';
    useDialogBackdrop({ onClose: starting ? () => { } : onClose });
    useEffect(() => window.scamp.onReactImportProgress((event) => {
        if (event.kind === 'phase') {
            setStep((s) => (s.kind === 'starting' ? { ...s, phase: event.phase } : s));
            return;
        }
        const lines = event.text.split(/\r?\n/).filter((line) => line.trim().length > 0);
        setLog((prev) => [...prev, ...lines].slice(-LOG_LINES));
    }), []);
    const handleChoose = async () => {
        const result = await window.scamp.reactImportInspect();
        if (result.kind === 'cancelled')
            return;
        if (result.kind === 'unsupported') {
            setStep({ kind: 'choose', error: result.reason });
            return;
        }
        setStep({ kind: 'confirm', app: result });
    };
    const handleRun = async (app) => {
        setLog([]);
        setStep({ kind: 'starting', app, phase: app.installCommand !== null ? 'installing' : 'starting' });
        const result = await window.scamp.reactImportStart({ projectPath, folder: app.folder });
        if (result.ok)
            onReady(result.url, app.name);
        else
            setStep({ kind: 'failed', app, error: result.error });
    };
    const url = asAppUrl(address);
    const handleOpenAddress = () => {
        if (url === null)
            return;
        onReady(url, new URL(url).host);
    };
    return (_jsx("div", { className: dialogStyles.backdrop, onClick: starting ? undefined : onClose, children: _jsxs("div", { className: `${dialogStyles.dialog} ${styles.dialog}`, role: "dialog", "aria-modal": "true", "aria-labelledby": "react-import-title", "data-testid": "react-import-dialog", onClick: (e) => e.stopPropagation(), children: [_jsx("h2", { id: "react-import-title", className: dialogStyles.title, children: "Import a React app" }), step.kind === 'choose' && (_jsxs(_Fragment, { children: [_jsx("p", { className: dialogStyles.message, children: "Choose the app\u2019s project folder. Scamp runs its dev server, lists its pages, and imports the ones you pick as views." }), step.error !== undefined && _jsx("p", { className: dialogStyles.error, children: step.error }), _jsx("div", { className: styles.row, children: _jsx(Button, { variant: "primary", onClick: () => void handleChoose(), children: "Choose folder\u2026" }) }), _jsx("p", { className: styles.or, children: "Or, if it\u2019s already running, enter its address:" }), _jsxs("form", { className: styles.row, onSubmit: (e) => {
                                e.preventDefault();
                                handleOpenAddress();
                            }, children: [_jsx("input", { className: styles.address, value: address, onChange: (e) => setAddress(e.target.value), placeholder: "http://localhost:5173", spellCheck: false, "aria-label": "Running app address" }), _jsx(Button, { type: "submit", disabled: url === null, children: "Open" })] })] })), step.kind === 'confirm' && (_jsxs(_Fragment, { children: [_jsxs("p", { className: dialogStyles.message, children: [_jsx("strong", { children: step.app.name }), " is a ", step.app.framework, " app. To show its pages, Scamp runs", step.app.installCommand !== null ? ' these commands' : ' this command', " in", ' ', _jsx("code", { className: styles.code, children: step.app.folder }), ":"] }), _jsxs("ul", { className: styles.commands, children: [step.app.installCommand !== null && (_jsx("li", { children: _jsx("code", { className: styles.code, children: step.app.installCommand }) })), _jsx("li", { children: _jsx("code", { className: styles.code, children: step.app.devCommand }) })] }), _jsx("p", { className: styles.note, children: "This runs the project\u2019s own code on your computer. Scamp stops the server when you close the import window." }), _jsxs("div", { className: dialogStyles.actions, children: [_jsx(Button, { variant: "ghost", onClick: onClose, children: "Cancel" }), _jsx(Button, { variant: "primary", onClick: () => void handleRun(step.app), autoFocus: true, children: "Run and import" })] })] })), (step.kind === 'starting' || step.kind === 'failed') && (_jsxs(_Fragment, { children: [_jsx("p", { className: dialogStyles.message, role: "status", children: step.kind === 'failed'
                                ? `${step.app.name} didn’t start.`
                                : step.phase === 'installing'
                                    ? `Installing ${step.app.name}’s dependencies…`
                                    : `Starting ${step.app.name}…` }), step.kind === 'failed' && _jsx("p", { className: dialogStyles.error, children: step.error }), log.length > 0 && (_jsx("pre", { className: styles.log, "data-testid": "react-import-log", children: log.join('\n') })), step.kind === 'failed' && (_jsxs("div", { className: dialogStyles.actions, children: [_jsx(Button, { variant: "ghost", onClick: onClose, children: "Close" }), _jsx(Button, { variant: "primary", onClick: () => void handleRun(step.app), children: "Try again" })] }))] }))] }) }));
};
