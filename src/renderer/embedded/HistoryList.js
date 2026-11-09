import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { formatRelativeTime } from '@store/formatHistoryLabel';
import { useEmbeddedStore } from './embeddedStore';
import { goToHistory, refreshGit, refreshHistory } from './session';
import styles from './HistoryList.module.css';
const exact = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const Row = ({ label, details, time, files, current, undone, now, disabled, onGo }) => (_jsx("li", { className: styles.row, "data-current": current, "data-undone": undone, children: _jsxs("button", { type: "button", className: styles.go, onClick: onGo, disabled: disabled || current, "aria-current": current ? 'step' : undefined, "data-testid": "embedded-history-entry", children: [_jsx("span", { className: styles.label, children: label }), details.length > 0 && (_jsx("ul", { className: styles.details, children: details.map((d) => (_jsx("li", { children: d }, d))) })), _jsxs("span", { className: styles.meta, children: [time !== null && _jsx("span", { title: exact.format(new Date(time * 1000)), children: formatRelativeTime(time * 1000, now) }), files.length > 0 && _jsx("span", { title: files.join('\n'), children: files.length === 1 ? files[0] : `${files.length} files` })] })] }) }));
/**
 * Scamp's changes on this branch as a timeline, like the canvas's History
 * panel: oldest first, the project's current point marked, and the steps
 * gone back past dimmed below a divider. Click any entry to go there.
 * see docs/plans/embedded-canvas-gaps.md (P3)
 */
export const HistoryList = ({ active }) => {
    const history = useEmbeddedStore((s) => s.history);
    const phase = useEmbeddedStore((s) => s.agent.phase);
    const [now, setNow] = useState(Date.now());
    const [busy, setBusy] = useState(false);
    const [blocked, setBlocked] = useState(null);
    useEffect(() => {
        if (active)
            void refreshHistory();
    }, [active, phase]);
    // Keep "3 min ago" current.
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(timer);
    }, []);
    if (history === null || history.entries.length === 0)
        return null;
    const handleGo = async (sha) => {
        setBusy(true);
        setBlocked(null);
        const result = await goToHistory(sha);
        setBusy(false);
        if (!result.ok)
            setBlocked({ sha, error: result.error, canRevert: result.code === 'pushed' });
    };
    const handleRevert = async (sha) => {
        setBusy(true);
        const result = await window.scampEmbedded.revert(sha);
        setBusy(false);
        setBlocked(result.ok ? null : { sha, error: result.error, canRevert: false });
        await Promise.all([refreshHistory(), refreshGit()]);
    };
    const oldestFirst = [...history.entries].reverse();
    const firstUndone = oldestFirst.findIndex((e) => e.undone);
    return (_jsxs("section", { className: styles.history, "aria-labelledby": "embedded-history-title", children: [_jsx("h3", { id: "embedded-history-title", className: styles.title, children: "History" }), _jsxs("ol", { className: styles.list, "data-testid": "embedded-history", children: [history.base !== null && (_jsx(Row, { label: "Session start", details: [], time: null, files: [], current: history.atBase, undone: false, now: now, disabled: busy, onGo: () => void handleGo(history.base ?? '') })), oldestFirst.map((entry, i) => (_jsx(HistoryRow, { entry: entry, divider: i === firstUndone, now: now, busy: busy, onGo: handleGo }, entry.sha)))] }), blocked !== null && (_jsxs("div", { className: styles.blocked, role: "status", "data-testid": "embedded-history-blocked", children: [_jsx("p", { children: blocked.error }), blocked.canRevert && (_jsx("button", { type: "button", className: styles.revert, disabled: busy, onClick: () => void handleRevert(blocked.sha), children: "Revert this change instead" }))] }))] }));
};
const HistoryRow = ({ entry, divider, now, busy, onGo }) => {
    // A commit Scamp made lists its changes; any other shows its subject.
    const scamp = entry.subject.startsWith('Scamp: ');
    const label = entry.changes.length > 0 ? (entry.changes[0] ?? '') : scamp ? entry.subject.slice('Scamp: '.length) : entry.subject;
    return (_jsxs(_Fragment, { children: [divider && (_jsx("li", { className: styles.divider, "aria-hidden": "true", children: "Undone" })), _jsx(Row, { label: label, details: entry.changes.slice(1), time: entry.time, files: entry.files, current: entry.current, undone: entry.undone, now: now, disabled: busy, onGo: () => void onGo(entry.sha) })] }));
};
