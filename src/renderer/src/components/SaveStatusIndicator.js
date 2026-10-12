import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSaveStatusStore } from '@store/saveStatusSlice';
import { useCanvasStore } from '@store/canvasSlice';
import { useHistoryStore } from '@store/historySlice';
import { useTerminalActivityStore } from '@store/terminalActivitySlice';
import { formatHistoryLabel } from '@store/formatHistoryLabel';
import { discardDivergedCanvas, resumeFromPause, retryLastSave, saveDivergedCanvas, } from '../syncBridge';
import styles from './SaveStatusIndicator.module.css';
/** Cap on how many recent edits the diverged popover lists. Above
 *  this the popover would scroll; better to show "+ N more." */
const MAX_DIFF_ENTRIES = 5;
/**
 * Header indicator showing whether canvas edits are in sync with disk.
 * Driven by `useSaveStatusStore`. Seven states; in every state the
 * pill opens a popover that includes a manual Pause / Resume toggle
 * (this replaces the old standalone `SyncPauseToggle` button).
 *
 *   - saved          — canvas == disk. Popover offers Pause sync.
 *   - unsaved        — canvas has uncommitted edits, debounce pending.
 *                      Popover offers Pause sync.
 *   - saving         — write IPC in flight. Popover offers Pause sync.
 *   - error          — write failed. Popover shows the message and
 *                      Retry; also offers Pause sync.
 *   - paused         — sync engine intentionally suspended. Popover
 *                      explains why (manual /
 *                      external-edit) and offers Resume.
 *   - diverged       — pause cleared; canvas + disk don't match;
 *                      user picks Save canvas or Discard canvas.
 *   - reloaded-from-disk
 *                    — last write hit a conflict and Scamp adopted
 *                      disk; user's in-flight edit was discarded.
 */
export const SaveStatusIndicator = () => {
    const state = useSaveStatusStore((s) => s.state);
    const [popoverOpen, setPopoverOpen] = useState(false);
    const wrapRef = useRef(null);
    // Dismiss the popover on a click anywhere outside its host span.
    useEffect(() => {
        if (!popoverOpen)
            return;
        const handler = (e) => {
            if (wrapRef.current &&
                e.target instanceof Node &&
                !wrapRef.current.contains(e.target)) {
                setPopoverOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [popoverOpen]);
    const close = () => setPopoverOpen(false);
    return (_jsxs("span", { ref: wrapRef, className: styles.wrap, children: [renderPill(state, popoverOpen, () => setPopoverOpen((v) => !v)), popoverOpen && (_jsx("span", { className: styles.popover, role: "dialog", children: renderPopover(state, close) }))] }));
};
const renderPill = (state, expanded, onClick) => {
    const variant = pillVariantFor(state);
    return (_jsxs("button", { type: "button", className: `${styles.indicator} ${styles[variant.styleKey]} ${styles.button}`, "aria-live": variant.ariaLive, "aria-expanded": expanded, "data-testid": "save-status", "data-status": variant.dataStatus, onClick: onClick, children: [_jsx("span", { className: `${styles.glyph} ${variant.spin ? styles.spinner : ''}`, "aria-hidden": "true", children: variant.glyph }), variant.label, state.kind === 'error' && (_jsx("span", { className: styles.errorMessage, title: state.message }))] }));
};
const pillVariantFor = (state) => {
    switch (state.kind) {
        case 'saved':
            return {
                styleKey: 'saved',
                dataStatus: 'saved',
                ariaLive: 'polite',
                glyph: '✓',
                label: 'Saved',
                spin: false,
            };
        case 'saving':
            return {
                styleKey: 'saving',
                dataStatus: 'saving',
                ariaLive: 'polite',
                glyph: '↑',
                label: 'Saving…',
                spin: true,
            };
        case 'unsaved':
            return {
                styleKey: 'unsaved',
                dataStatus: 'unsaved',
                ariaLive: 'polite',
                glyph: '●',
                label: 'Unsaved',
                spin: false,
            };
        case 'error':
            return {
                styleKey: 'error',
                dataStatus: 'error',
                ariaLive: 'assertive',
                glyph: '⚠',
                label: 'Save failed',
                spin: false,
            };
        case 'paused':
            return {
                styleKey: 'paused',
                dataStatus: 'paused',
                ariaLive: 'polite',
                glyph: '⏸',
                label: 'Paused',
                spin: false,
            };
        case 'diverged':
            return {
                styleKey: 'diverged',
                dataStatus: 'diverged',
                ariaLive: 'assertive',
                glyph: '⚠',
                label: 'Diverged',
                spin: false,
            };
        case 'reloaded-from-disk':
            return {
                styleKey: 'reloaded',
                dataStatus: 'reloaded-from-disk',
                ariaLive: 'polite',
                glyph: '↺',
                label: 'Reloaded',
                spin: false,
            };
    }
};
/**
 * Manual Pause / Resume control — present in EVERY popover variant.
 * This is the merged-in `SyncPauseToggle` UI: rather than a separate
 * toolbar button, the user opens the save-indicator dropdown and the
 * toggle lives there. Resume also ends a pause an external edit opened.
 */
const ManualToggle = ({ onAction }) => {
    const intent = useTerminalActivityStore((s) => s.userIntent);
    const setUserIntent = useTerminalActivityStore((s) => s.setUserIntent);
    const state = useSaveStatusStore((s) => s.state);
    // Show Resume when the bridge is currently paused (whatever the
    // reason), or when the user already manually paused. Otherwise show
    // Pause.
    const showResume = intent === 'paused' || state.kind === 'paused';
    const label = showResume ? 'Resume sync' : 'Pause sync';
    const handleClick = () => {
        if (!showResume) {
            setUserIntent('paused');
        }
        else if (intent === 'paused') {
            setUserIntent('auto');
        }
        else {
            resumeFromPause();
        }
        onAction();
    };
    return (_jsx("button", { type: "button", className: styles.popoverButton, onClick: handleClick, "data-testid": "manual-sync-toggle", children: label }));
};
/**
 * Diverged-state popover. Splits out into its own component because
 * it needs `useHistoryStore` / `useCanvasStore` subscriptions — the
 * other popover branches are stateless. Lists the canvas edits that
 * happened DURING the pause so the user can decide between Save
 * canvas and Discard canvas with a clear picture of what's at stake.
 */
const DivergedPopoverBody = ({ onAction, }) => {
    const pauseStartedAt = useSaveStatusStore((s) => s.pauseStartedAt);
    const activePageId = useHistoryStore((s) => s.activePageId);
    const pageHistory = useHistoryStore((s) => activePageId ? s.perPage[activePageId] : undefined);
    const elements = useCanvasStore((s) => s.elements);
    const recentEntries = useMemo(() => {
        if (!pageHistory)
            return [];
        const since = pauseStartedAt ?? 0;
        return pageHistory.entries.filter((e) => e.timestamp >= since);
    }, [pageHistory, pauseStartedAt]);
    const visible = recentEntries.slice(-MAX_DIFF_ENTRIES).reverse();
    const overflow = Math.max(0, recentEntries.length - visible.length);
    return (_jsxs(_Fragment, { children: [_jsx("p", { className: styles.popoverBody, children: "Your canvas changes haven't been saved because the file was edited externally. Choose which version to keep." }), visible.length > 0 && (_jsxs("div", { className: styles.divergedDiff, children: [_jsx("div", { className: styles.divergedDiffHeader, children: "Canvas changes since the pause:" }), _jsxs("ul", { className: styles.divergedDiffList, children: [visible.map((entry) => (_jsx("li", { children: formatHistoryLabel(entry, elements) }, entry.id))), overflow > 0 && (_jsxs("li", { className: styles.divergedDiffOverflow, children: ["+ ", overflow, " more"] }))] })] })), _jsxs("div", { className: styles.popoverActions, children: [_jsx("button", { type: "button", className: styles.popoverButton, onClick: () => {
                            saveDivergedCanvas();
                            onAction();
                        }, children: "Save canvas" }), _jsx("button", { type: "button", className: styles.popoverButton, onClick: () => {
                            discardDivergedCanvas();
                            onAction();
                        }, children: "Discard canvas" })] })] }));
};
const renderPopover = (state, close) => {
    // Diverged has its own full body (Save canvas / Discard canvas) and
    // doesn't get the manual toggle — Save/Discard is the user's choice
    // at this moment, pausing isn't useful here.
    if (state.kind === 'diverged') {
        return _jsx(DivergedPopoverBody, { onAction: close });
    }
    const bodyCopy = popoverBodyCopyFor(state);
    return (_jsxs(_Fragment, { children: [bodyCopy, _jsx("div", { className: styles.popoverDivider }), _jsx("div", { className: styles.popoverActions, children: _jsx(ManualToggle, { onAction: close }) })] }));
};
const popoverBodyCopyFor = (state) => {
    if (state.kind === 'paused') {
        const message = state.reason === 'manual'
            ? "Sync is paused — you've paused saving manually. Edits save when you leave the page or resume."
            : 'Sync paused — an external editor is writing to project files. Canvas edits will queue until activity settles.';
        return _jsx("p", { className: styles.popoverBody, children: message });
    }
    if (state.kind === 'reloaded-from-disk') {
        return (_jsxs("p", { className: styles.popoverBody, children: [_jsx("code", { children: state.file }), " was edited externally while Scamp was saving. The canvas was reloaded from disk; any in-flight edit was dropped."] }));
    }
    if (state.kind === 'error') {
        return (_jsxs("p", { className: styles.popoverBody, children: ["Save failed: ", _jsx("code", { children: state.message }), _jsx("br", {}), _jsx("button", { type: "button", className: styles.retryButton, onClick: () => retryLastSave(), children: "Retry" })] }));
    }
    if (state.kind === 'saving') {
        return (_jsx("p", { className: styles.popoverBody, children: "Writing canvas edits to disk\u2026" }));
    }
    if (state.kind === 'unsaved') {
        return (_jsx("p", { className: styles.popoverBody, children: "Canvas has unsaved edits. Scamp will write them to disk shortly." }));
    }
    // saved
    return (_jsx("p", { className: styles.popoverBody, children: "Canvas is in sync with project files on disk." }));
};
