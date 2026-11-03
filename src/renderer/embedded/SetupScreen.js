import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { CheckRow } from './CheckRow';
import { useEmbeddedStore } from './embeddedStore';
import { refreshGit } from './session';
import styles from './SetupScreen.module.css';
const GROUPS = [
    { id: 'accounts', title: 'Accounts' },
    { id: 'environment', title: 'Environment' },
    { id: 'project', title: 'What Scamp will do' },
];
const PHASE_TEXT = {
    branch: 'Creating your branch…',
    configure: 'Configuring element mapping…',
    installing: 'Installing packages…',
    starting: 'Starting the dev server…',
};
/** Before anything runs: what passed, what needs attention, and what Start will do. */
export const SetupScreen = () => {
    const preflight = useEmbeddedStore((s) => s.preflight);
    const starting = useEmbeddedStore((s) => s.starting);
    const startLog = useEmbeddedStore((s) => s.startLog);
    const startError = useEmbeddedStore((s) => s.startError);
    const set = useEmbeddedStore((s) => s.set);
    const [phase, setPhase] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => window.scampEmbedded.onStartProgress((p) => {
        if (p.kind === 'phase')
            setPhase(p.phase);
        else
            useEmbeddedStore.setState((s) => ({ startLog: (s.startLog + p.text).slice(-6000) }));
    }), []);
    const recheck = async () => {
        const report = await window.scampEmbedded.preflight();
        if ('error' in report)
            setError(report.error);
        else
            set({ preflight: report });
    };
    const handleFix = async (fix, value) => {
        setError(null);
        if (fix === 'git-init') {
            const result = await window.scampEmbedded.gitInit();
            if (!result.ok)
                setError(result.error);
        }
        else if (fix === 'sign-in') {
            await window.scampEmbedded.signIn();
        }
        else if (fix === 'connect-agent' && value !== undefined) {
            const result = await window.scampEmbedded.setAgentKey(value.trim());
            if (!result.ok)
                setError(result.message);
        }
        await recheck();
    };
    const handleStart = async () => {
        set({ starting: true, startError: null, startLog: '' });
        const result = await window.scampEmbedded.start();
        if (!result.ok) {
            set({ starting: false, startError: result.error });
            return;
        }
        set({ starting: false, url: result.url, branch: result.branch, screen: 'editor' });
        void refreshGit();
    };
    if (preflight === null)
        return _jsx("div", { className: styles.screen });
    return (_jsx("div", { className: styles.screen, children: _jsxs("div", { className: styles.column, children: [_jsxs("div", { className: styles.head, children: [_jsxs("h1", { className: styles.title, children: ["Set up ", preflight.name] }), _jsx("p", { className: styles.folder, children: preflight.folder })] }), GROUPS.map((group) => {
                    const checks = preflight.checks.filter((c) => c.group === group.id);
                    if (checks.length === 0)
                        return null;
                    return (_jsxs("section", { className: styles.group, children: [_jsx("h2", { className: styles.groupTitle, children: group.title }), _jsx("ul", { className: styles.list, children: checks.map((check) => (_jsx(CheckRow, { check: check, onFix: handleFix }, check.id))) })] }, group.id));
                }), error !== null && _jsx("p", { className: styles.error, children: error }), startError !== null && _jsx("p", { className: styles.error, "data-testid": "embedded-start-error", children: startError }), _jsxs("div", { className: styles.actions, children: [_jsx("button", { type: "button", className: styles.secondary, onClick: () => void recheck(), disabled: starting, children: "Check again" }), _jsx("button", { type: "button", className: styles.primary, onClick: () => void handleStart(), disabled: !preflight.canStart || starting, "data-testid": "embedded-start", children: starting ? (phase !== null ? PHASE_TEXT[phase] ?? 'Starting…' : 'Starting…') : 'Start' })] }), (starting || startError !== null) && startLog.length > 0 && (_jsxs("details", { className: styles.log, open: startError !== null, children: [_jsx("summary", { children: "Output" }), _jsx("pre", { children: startLog })] }))] }) }));
};
