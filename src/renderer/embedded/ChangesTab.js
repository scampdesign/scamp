import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { DiffView } from './DiffView';
import { useEmbeddedStore } from './embeddedStore';
import { refreshGit, runInspector } from './session';
import styles from './ChangesTab.module.css';
const summary = (item) => item.kind === 'style'
    ? `<${item.element.tag}${item.state !== undefined ? `:${item.state}` : ''}> ${item.changes.map((c) => `${c.property} → ${c.to}`).join(', ')}${item.scope === 'all' ? ' (all)' : ''}`
    : item.text;
/** The agent's queue and controls, review of what it wrote, and git. */
export const ChangesTab = () => {
    const agent = useEmbeddedStore((s) => s.agent);
    const git = useEmbeddedStore((s) => s.git);
    const log = useEmbeddedStore((s) => s.agentLog);
    const notice = useEmbeddedStore((s) => s.notice);
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
        await refreshGit();
    };
    return (_jsxs("div", { className: styles.tab, children: [_jsxs("section", { className: styles.section, children: [_jsx("h3", { className: styles.title, children: "Agent" }), _jsxs("div", { className: styles.row, children: [_jsx("button", { type: "button", className: styles.button, "aria-pressed": agent.paused, onClick: () => void window.scampEmbedded.setPaused(!agent.paused), "data-testid": "embedded-pause", children: agent.paused ? 'Resume' : 'Pause' }), _jsx("button", { type: "button", className: styles.button, disabled: agent.queued.length === 0 || running, onClick: () => void window.scampEmbedded.runNow(), "data-testid": "embedded-run-now", children: "Run now" }), running && (_jsx("button", { type: "button", className: styles.button, onClick: () => void window.scampEmbedded.cancel(), children: "Stop" }))] }), agent.message !== undefined && _jsx("p", { className: styles.note, children: agent.message }), agent.queued.length === 0 ? (_jsx("p", { className: styles.empty, children: agent.paused ? 'Paused. Edits wait here until you resume or run them.' : 'Edits you make go to the agent here.' })) : (_jsx("ul", { className: styles.list, "data-testid": "embedded-queue", children: agent.queued.map((item) => (_jsxs("li", { className: styles.item, children: [_jsx("span", { className: styles.itemText, children: summary(item) }), _jsx("button", { type: "button", className: styles.remove, onClick: () => void window.scampEmbedded.removeQueued(item.id), "aria-label": "Remove from queue", children: "\u2715" })] }, item.id))) }))] }), files.length > 0 && (_jsxs("section", { className: styles.section, "data-testid": "embedded-review", children: [_jsx("h3", { className: styles.title, children: "Review the agent\u2019s changes" }), _jsx("ul", { className: styles.files, children: files.map((f) => (_jsx("li", { children: f }, f))) }), diff.length > 0 && _jsx(DiffView, { diff: diff }), _jsx("input", { className: styles.input, value: message, onChange: (e) => setMessage(e.target.value), placeholder: "Commit message", "aria-label": "Commit message" }), _jsxs("div", { className: styles.row, children: [_jsx("button", { type: "button", className: styles.primary, disabled: busy || running, onClick: () => void act(() => window.scampEmbedded.accept(message), 'Committed.'), "data-testid": "embedded-accept", children: "Accept" }), _jsx("button", { type: "button", className: styles.button, disabled: busy || running, onClick: () => void act(async () => {
                                    const result = await window.scampEmbedded.discard();
                                    if (result.ok)
                                        await runInspector({ type: 'clear' });
                                    return result;
                                }, 'Discarded.'), "data-testid": "embedded-discard", children: "Discard" })] })] })), git !== null && (_jsxs("section", { className: styles.section, children: [_jsx("h3", { className: styles.title, children: "Branch" }), _jsx("div", { className: styles.row, children: _jsx("select", { className: styles.select, value: git.branch, onChange: (e) => void act(() => window.scampEmbedded.switchBranch(e.target.value, false), 'Switched.'), "aria-label": "Switch branch", disabled: busy, children: git.branches.map((b) => (_jsx("option", { value: b, children: b }, b))) }) }), _jsxs("form", { className: styles.row, onSubmit: (e) => {
                            e.preventDefault();
                            void act(() => window.scampEmbedded.switchBranch(newBranch.trim(), true), 'Branch created.').then(() => setNewBranch(''));
                        }, children: [_jsx("input", { className: styles.input, value: newBranch, onChange: (e) => setNewBranch(e.target.value), placeholder: "new-branch-name", "aria-label": "New branch name" }), _jsx("button", { type: "submit", className: styles.button, disabled: busy || newBranch.trim().length === 0, children: "Create" })] }), _jsxs("div", { className: styles.row, children: [_jsxs("button", { type: "button", className: styles.button, disabled: busy || !git.hasRemote, onClick: () => void act(() => window.scampEmbedded.push()), "data-testid": "embedded-push", children: ["Push", git.ahead > 0 ? ` (${git.ahead})` : ''] }), _jsxs("button", { type: "button", className: styles.button, disabled: busy || !git.hasRemote, onClick: () => void act(() => window.scampEmbedded.pull()), "data-testid": "embedded-pull", children: ["Pull", git.behind > 0 ? ` (${git.behind})` : ''] })] }), !git.hasRemote && _jsx("p", { className: styles.note, children: "Add a remote named origin to push and pull." })] })), notice !== null && _jsx("p", { className: styles.notice, "data-testid": "embedded-notice", children: notice }), git !== null && git.scampCommits.length > 0 && (_jsxs("section", { className: styles.section, children: [_jsx("h3", { className: styles.title, children: "Scamp\u2019s commits" }), _jsx("ul", { className: styles.list, "data-testid": "embedded-commits", children: git.scampCommits.map((c) => (_jsxs("li", { className: styles.item, children: [_jsx("span", { className: styles.itemText, children: c.subject }), _jsx("button", { type: "button", className: styles.button, disabled: busy, onClick: () => void act(() => window.scampEmbedded.revert(c.sha), 'Reverted.'), children: "Revert" })] }, c.sha))) })] })), log.length > 0 && (_jsxs("details", { className: styles.log, children: [_jsx("summary", { children: "Agent log" }), log.map((entry, i) => (_jsx("p", { className: styles.logLine, "data-kind": entry.kind, "data-ok": entry.ok === false ? 'false' : 'true', children: entry.text }, i)))] }))] }));
};
