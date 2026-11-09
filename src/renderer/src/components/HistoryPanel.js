import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { IconArrowBackUp, IconBolt, IconBookmark, IconPlayerPlay, IconPlayerStop, IconRefresh, } from '@tabler/icons-react';
import { useSnapshotsStore } from '@store/snapshotsSlice';
import { useCanvasStore } from '@store/canvasSlice';
import { selectActivePageHistory, useHistoryStore } from '@store/historySlice';
import { formatPageCount, mergeHistoryTimeline, triggerIcon, } from '@store/snapshotDisplay';
import { formatHistoryLabel, formatRelativeTime } from '@store/formatHistoryLabel';
import { Tooltip } from './controls/Tooltip';
import { Button } from './controls/Button';
import styles from './HistoryPanel.module.css';
const TRIGGER_ICON = {
    'session-open': IconPlayerPlay,
    'session-close': IconPlayerStop,
    agent: IconBolt,
    manual: IconBookmark,
    auto: IconRefresh,
    restore: IconArrowBackUp,
};
/**
 * The History panel — the second tab in the left sidebar. Shows a unified,
 * newest-first timeline (with a "Now" marker) that interleaves the
 * project's durable on-disk snapshots with the active page's in-memory
 * undo entries, so users get per-edit granularity between the coarser
 * snapshots without extra disk writes. Clicking a snapshot restores it
 * from disk (after confirming); clicking an undo entry jumps the canvas to
 * that point in-session (current page, no disk write). "Save snapshot"
 * takes a manual one. See docs/notes/snapshots.md.
 */
export const HistoryPanel = ({ projectPath }) => {
    const snapshots = useSnapshotsStore((s) => s.snapshots);
    const loadSnapshots = useSnapshotsStore((s) => s.loadSnapshots);
    const takeSnapshot = useSnapshotsStore((s) => s.takeSnapshot);
    const previewSnapshot = useSnapshotsStore((s) => s.previewSnapshot);
    // In-session undo stack (active page only) — interleaved with snapshots.
    const history = useHistoryStore(selectActivePageHistory);
    const transactionDepth = useHistoryStore((s) => s.transactionDepth);
    const jumpToHistory = useHistoryStore((s) => s.jumpToHistory);
    const elements = useCanvasStore((s) => s.elements);
    const isPreviewing = useCanvasStore((s) => s.snapshotPreview !== null);
    // Suppress undo jumps mid-drag, and while previewing a snapshot (the
    // canvas is showing snapshot content, not the live undo state).
    const isDragging = transactionDepth > 0;
    // Refresh the list every time the panel mounts (i.e. the tab is opened)
    // so agent-edit / auto-save snapshots taken while it was hidden appear.
    useEffect(() => {
        void loadSnapshots(projectPath);
    }, [loadSnapshots, projectPath]);
    // 30s tick keeps relative timestamps fresh ("just now" → "1 min ago").
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 30_000);
        return () => clearInterval(id);
    }, []);
    const now = Date.now();
    // Manual-snapshot naming state.
    const [naming, setNaming] = useState(false);
    const [name, setName] = useState('');
    const handleSaveSnapshot = () => {
        void takeSnapshot(projectPath, 'manual', name.trim() || undefined);
        setName('');
        setNaming(false);
    };
    const timeline = mergeHistoryTimeline(snapshots, history.entries, history.cursor);
    return (_jsxs("div", { className: styles.panel, children: [_jsx("div", { className: styles.header, children: naming ? (_jsx("input", { className: styles.nameInput, autoFocus: true, value: name, placeholder: "Snapshot name (optional)", onChange: (e) => setName(e.target.value), onKeyDown: (e) => {
                        if (e.key === 'Enter')
                            handleSaveSnapshot();
                        if (e.key === 'Escape') {
                            setNaming(false);
                            setName('');
                        }
                    }, onBlur: () => {
                        setNaming(false);
                        setName('');
                    } })) : (_jsx(Button, { variant: "secondary", fullWidth: true, disabled: isPreviewing, onClick: () => setNaming(true), children: "Save snapshot" })) }), _jsxs("ul", { className: styles.list, children: [_jsx("li", { className: `${styles.row} ${styles.nowRow}`, children: isPreviewing ? (
                        // While previewing, "Now" is the way back to the live state.
                        _jsxs("button", { type: "button", className: `${styles.rowButton} ${styles.nowExit}`, onClick: () => useCanvasStore.getState().exitSnapshotPreview(), title: "Exit preview and return to the current state", children: [_jsx("span", { className: styles.bullet, "aria-hidden": "true", children: "\u25CF" }), _jsx("span", { className: styles.label, children: "Now" })] })) : (_jsxs("div", { className: styles.rowButton, children: [_jsx("span", { className: styles.bullet, "aria-hidden": "true", children: "\u25CF" }), _jsx("span", { className: styles.label, children: "Now" })] })) }), timeline.length === 0 ? (_jsx("li", { children: _jsx("p", { className: styles.empty, children: "No history yet" }) })) : (timeline.map((item) => item.kind === 'snapshot' ? (_jsx(SnapshotRow, { snapshot: item.snapshot, now: now, onSelect: () => void previewSnapshot(projectPath, item.snapshot) }, `s-${item.snapshot.id}`)) : (_jsx(UndoRow, { entry: item.entry, elements: elements, now: now, isCurrent: item.isCurrent, isFuture: item.isFuture, onJump: isDragging || isPreviewing || item.isCurrent
                            ? undefined
                            : () => jumpToHistory(item.index) }, `u-${item.entry.id}`))))] })] }));
};
const SnapshotRow = ({ snapshot, now, onSelect }) => {
    const Icon = TRIGGER_ICON[triggerIcon(snapshot.trigger)];
    const ts = Date.parse(snapshot.timestamp);
    const relative = formatRelativeTime(ts, now);
    const absolute = new Date(ts).toLocaleString();
    return (_jsx("li", { className: styles.row, children: _jsx(Tooltip, { label: absolute, children: _jsxs("button", { type: "button", className: styles.rowButton, onClick: onSelect, children: [_jsx("span", { className: styles.icon, "aria-hidden": "true", children: _jsx(Icon, { size: 14 }) }), _jsxs("span", { className: styles.label, children: [snapshot.label, _jsxs("span", { className: styles.secondary, children: [' · ', formatPageCount(snapshot.pageCount)] })] }), _jsx("span", { className: styles.timestamp, children: relative })] }) }) }));
};
const UndoRow = ({ entry, elements, now, isCurrent, isFuture, onJump, }) => {
    const label = formatHistoryLabel(entry, elements);
    const relative = formatRelativeTime(entry.timestamp, now);
    const absolute = new Date(entry.timestamp).toLocaleTimeString();
    const rowClass = [
        styles.row,
        styles.undoRow,
        isCurrent ? styles.current : '',
        isFuture ? styles.future : '',
    ]
        .filter(Boolean)
        .join(' ');
    return (_jsx("li", { className: rowClass, children: _jsx(Tooltip, { label: absolute, children: _jsxs("button", { type: "button", className: styles.rowButton, onClick: onJump, disabled: onJump === undefined, children: [_jsx("span", { className: styles.tick, "aria-hidden": "true", children: "\u2502" }), _jsx("span", { className: styles.label, children: label }), _jsx("span", { className: styles.timestamp, children: relative })] }) }) }));
};
