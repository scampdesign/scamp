import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { DiffView } from './DiffView';
import { HistoryList } from './HistoryList';
import { useEmbeddedStore } from './embeddedStore';
import { dropRunEntries, redo, refreshGit, refreshHistory, runInspector, undo } from './session';
import styles from './Tabs.module.css';
// Mac or not, for the shortcut the buttons name.
const MOD = navigator.userAgent.includes('Macintosh') ? '⌘' : 'Ctrl+';
/** Everything already done: undo and redo, the agent's changes to review, what was accepted, and git. */
export const HistoryTab = () => {
    const agent = useEmbeddedStore((s) => s.agent);
    const git = useEmbeddedStore((s) => s.git);
    const notice = useEmbeddedStore((s) => s.notice);
    const undoSteps = useEmbeddedStore((s) => s.undo);
    const redoSteps = useEmbeddedStore((s) => s.redo);
    const set = useEmbeddedStore((s) => s.set);
    const [diff, setDiff] = useState('');
    const [message, setMessage] = useState('');
    const [newBranch, setNewBranch] = useState('');
    const [busy, setBusy] = useState(false);
    const files = git?.agentFiles ?? [];
    const running = agent.phase === 'thinking' || agent.phase === 'writing';
    useEffect(() => {
        void refreshGit();
    }, []);
    // Re-read whenever the set of files the agent wrote changes, or a run ends.
    const fileKey = files.join('\n');
    const phase = agent.phase;
    useEffect(() => {
        if (fileKey.length === 0) {
            setDiff('');
            return;
        }
        void window.scampEmbedded.gitDiff(fileKey.split('\n')).then(setDiff);
    }, [fileKey, phase]);
    useEffect(() => {
        if (agent.lastText.length > 0)
            setMessage(agent.lastText.split('\n')[0]?.slice(0, 100) ?? '');
    }, [agent.lastText]);
    const act = async (fn, done) => {
        setBusy(true);
        const result = await fn();
        setBusy(false);
        set({ notice: result.ok ? (result.message ?? done ?? null) : result.error });
        await Promise.all([refreshGit(), refreshHistory()]);
    };
    return (_jsxs("div", { className: styles.tab, children: [git !== null && (_jsxs("section", { className: styles.section, "data-testid": "embedded-branch-section", children: [_jsx("h3", { className: styles.title, children: "Branch" }), _jsx("div", { className: styles.row, children: _jsx("select", { className: styles.select, value: git.branch, onChange: (e) => void act(() => window.scampEmbedded.switchBranch(e.target.value, false), 'Switched.'), "aria-label": "Switch branch", disabled: busy, children: git.branches.map((b) => (_jsx("option", { value: b, children: b }, b))) }) }), _jsxs("form", { className: styles.row, onSubmit: (e) => {
                            e.preventDefault();
                            void act(() => window.scampEmbedded.switchBranch(newBranch.trim(), true), 'Branch created.').then(() => setNewBranch(''));
                        }, children: [_jsx("input", { className: styles.input, value: newBranch, onChange: (e) => setNewBranch(e.target.value), placeholder: "new-branch-name", "aria-label": "New branch name" }), _jsx("button", { type: "submit", className: styles.button, disabled: busy || newBranch.trim().length === 0, children: "Create" })] }), _jsxs("div", { className: styles.row, children: [_jsxs("button", { type: "button", className: styles.button, disabled: busy || !git.hasRemote, onClick: () => void act(() => window.scampEmbedded.push()), "data-testid": "embedded-push", children: ["Push", git.ahead > 0 ? ` (${git.ahead})` : ''] }), _jsxs("button", { type: "button", className: styles.button, disabled: busy || !git.hasRemote, onClick: () => void act(() => window.scampEmbedded.pull()), "data-testid": "embedded-pull", children: ["Pull", git.behind > 0 ? ` (${git.behind})` : ''] })] }), !git.hasRemote && _jsx("p", { className: styles.note, children: "Add a remote named origin to push and pull." })] })), _jsxs("section", { className: styles.section, children: [_jsx("h3", { className: styles.title, children: "Undo" }), _jsxs("div", { className: styles.row, children: [_jsxs("button", { type: "button", className: styles.button, onClick: () => void undo(), "data-testid": "embedded-undo", children: ["Undo ", _jsxs("span", { className: styles.key, children: [MOD, "Z"] })] }), _jsxs("button", { type: "button", className: styles.button, onClick: () => void redo(), "data-testid": "embedded-redo", children: ["Redo ", _jsxs("span", { className: styles.key, children: [MOD, "\u21E7Z"] })] })] }), undoSteps.length + redoSteps.length === 0 ? (_jsx("p", { className: styles.empty, children: "Your edits and the agent\u2019s runs since the last Accept appear here. Past them, undo goes back through the history." })) : (_jsxs("ol", { className: styles.list, "data-testid": "embedded-undo-steps", children: [[...redoSteps].map((step, i) => (_jsx("li", { className: styles.item, "data-undone": "true", children: _jsx("span", { className: styles.itemText, children: step.label }) }, `r${i}`))), [...undoSteps].reverse().map((step, i) => (_jsx("li", { className: styles.item, "data-current": i === 0, children: _jsx("span", { className: styles.itemText, children: step.kind === 'run' ? `Agent wrote: ${step.label}` : step.label }) }, `u${i}`)))] }))] }), files.length > 0 && (_jsxs("section", { className: styles.section, "data-testid": "embedded-review", children: [_jsx("h3", { className: styles.title, children: "Review the agent\u2019s changes" }), _jsx("ul", { className: styles.files, children: files.map((f) => (_jsx("li", { children: f }, f))) }), diff.length > 0 && _jsx(DiffView, { diff: diff }), _jsx("input", { className: styles.input, value: message, onChange: (e) => setMessage(e.target.value), placeholder: "Commit message", "aria-label": "Commit message" }), _jsxs("div", { className: styles.row, children: [_jsx("button", { type: "button", className: styles.primary, disabled: busy || running, onClick: () => void act(async () => {
                                    const result = await window.scampEmbedded.accept(message);
                                    // Committed: undo goes through the history from here.
                                    if (result.ok)
                                        dropRunEntries();
                                    return result;
                                }, 'Committed.'), "data-testid": "embedded-accept", children: "Accept" }), _jsx("button", { type: "button", className: styles.button, disabled: busy || running, onClick: () => void act(async () => {
                                    const result = await window.scampEmbedded.discard();
                                    if (result.ok) {
                                        await runInspector({ type: 'clear' });
                                        dropRunEntries();
                                    }
                                    return result;
                                }, 'Discarded.'), "data-testid": "embedded-discard", children: "Discard" })] })] })), notice !== null && _jsx("p", { className: styles.notice, "data-testid": "embedded-notice", children: notice }), _jsx(HistoryList, { active: true })] }));
};
