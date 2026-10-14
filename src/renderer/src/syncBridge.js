// Renderer side of the save / sync pipeline. See
// docs/notes/save-status-machine.md.
//
// Phase 5.4 split `initSyncBridge` into the `syncBridge/` folder. The
// mutable per-bridge save cache (writeTimer, lastSerialized*,
// canvasChangedDuringQuiet, quietResumeTimer) lives in a `SaveContext`
// (saveContext.ts) threaded through the handler factories, which call
// each other through `ctx.*` so construction order doesn't matter:
//   writeIfDirty.ts      — serialize the canvas + write, conflict resolve
//   quietReconcile.ts    — debounce timer + quiet-window resume
//   divergence.ts        — save / discard a diverged canvas
//   storeSubscription.ts — canvas + terminal-activity subscriptions
//   externalEdit.ts      — chokidar file:changed handler
//   themeListener.ts     — theme.css changed handler
// editTarget / pendingSaves / writeDispatch / targetSwapSuppression hold
// the stateless-ish helpers. `initSyncBridge` below just builds the
// context, wires the handlers onto it, and registers / tears down the
// subscriptions + IPC listeners.
import { useCanvasStore } from '@store/canvasSlice';
import { useHistoryStore } from '@store/historySlice';
import { useTerminalActivityStore } from '@store/terminalActivitySlice';
import { createQuietWindow } from './lib/quietWindow';
import { handleAck } from './syncBridge/pendingSaves';
import { createSaveContext } from './syncBridge/saveContext';
import { makeOnWriteConflict, makeWriteIfDirty, } from './syncBridge/writeIfDirty';
import { makeCancelWriteTimer, makeFlushDebouncedWrite, makeReconcileAfterQuiet, makeResumeFromPause, makeScheduleQuietResume, } from './syncBridge/quietReconcile';
import { makeDiscardDivergedCanvas, makeSaveDivergedCanvas, } from './syncBridge/divergence';
import { makeAgentSubscriptionHandler, makeStoreSubscriptionHandler, } from './syncBridge/storeSubscription';
import { makeFileChangedHandler } from './syncBridge/externalEdit';
import { makeThemeChangedHandler } from './syncBridge/themeListener';
import { cancelContextWrite, flushContextWrite, makeContextFileHandler, } from './syncBridge/contextFile';
import { installMcpResponder } from './syncBridge/mcpResponder';
import { installAgentToolResponder } from './syncBridge/agentToolResponder';
// savePatch / retryLastSave moved to writeDispatch; re-exported so
// CssPanel + the save-status retry button keep importing from here.
export { savePatch, retryLastSave } from './syncBridge/writeDispatch';
// Target-swap write suppression moved to its own module; re-exported so
// component rename / delete keep importing from here.
export { armTargetSwapSuppression, disarmTargetSwapSuppression, } from './syncBridge/targetSwapSuppression';
/**
 * Module-scoped handle to the active bridge's debounced-write flusher.
 * Populated by `initSyncBridge` on mount and cleared on teardown. Used
 * by operations that change the active page's on-disk identity
 * (e.g. page rename) and need to force pending edits to land on the
 * OLD paths before the swap, so the debounced timer can't fire against
 * files that have just been deleted.
 */
let pendingFlush = null;
/** The open target's files as the save pipeline last wrote or read them. */
let lastSyncedImpl = null;
/**
 * What disk held for the open target when Scamp last wrote or read it —
 * unlike `pageSource`, which already carries edits still waiting to save.
 * A project re-read that matches this brings nothing new.
 */
export const lastSyncedSource = () => lastSyncedImpl?.() ?? null;
/**
 * Write the active target's pending edits now. Writes even while sync is
 * paused, because the callers are about to move the canvas off the target
 * and the edit would otherwise exist only in memory. Pass
 * `{ respectPause: true }` for a flush that isn't leaving anything.
 */
export const flushPendingPageWrite = (options = {}) => {
    pendingFlush?.(options.respectPause !== true);
};
/**
 * Module-scoped handles to the active bridge's pause/divergence actions,
 * populated by `initSyncBridge`. Exposed as free functions so the
 * save-status indicator + diverged popover don't import the whole bridge.
 */
let resumeFromPauseImpl = null;
let saveDivergedCanvasImpl = null;
let discardDivergedCanvasImpl = null;
/** Save-status indicator's `Resume now` button. */
export const resumeFromPause = () => {
    resumeFromPauseImpl?.();
};
/**
 * Phase 5.2 — force-write the canvas's current state to disk, overwriting
 * whatever the external editor wrote. Diverged popover's `Save canvas`.
 */
export const saveDivergedCanvas = () => {
    saveDivergedCanvasImpl?.();
};
/**
 * Phase 5.2 — abandon the canvas's in-memory state and reload from disk.
 * Diverged popover's `Discard canvas`.
 */
export const discardDivergedCanvas = () => {
    discardDivergedCanvasImpl?.();
};
/**
 * Wires the canvas store to the file system. See the per-handler files in
 * `syncBridge/` for the detailed behaviour; in summary:
 *
 *   - On any canvas state change: regenerate code and write the page files
 *     after a debounce, acked by main so chokidar won't re-read our write.
 *   - On `file:changed` for the active page: parse + reload the canvas, but
 *     only if the parsed tree differs from current state.
 *   - On `file:writeAck`: correlate against pending saves and advance the
 *     save-status indicator to "Saved".
 *   - On load: refresh the "last written" cache so the load doesn't write
 *     itself straight back to disk.
 *
 * Pending-write durability: a pending debounced write is flushed against
 * the OUTGOING page's state before a target swap and on `beforeunload`,
 * so an edit made within the debounce window is never silently dropped.
 */
export const initSyncBridge = () => {
    const quietWindow = createQuietWindow();
    const ctx = createSaveContext(quietWindow);
    // Register the snapshot-restore callback so the history slice can
    // apply a saved elements map when the user navigates (undo / redo /
    // click an entry). The callback writes through `setState` rather than
    // the typed `reloadElements` mutator so it doesn't toggle `isLoading`
    // or push another history entry — restoration is not an external edit.
    useHistoryStore.getState().setRestoreSnapshot((snapshot) => {
        useCanvasStore.setState({ elements: snapshot });
    });
    // Wire the cross-referencing handlers onto the context. Order is
    // irrelevant — each reads its collaborators via `ctx.*` at call time.
    ctx.cancelWriteTimer = makeCancelWriteTimer(ctx);
    ctx.onWriteConflict = makeOnWriteConflict(ctx);
    ctx.writeIfDirty = makeWriteIfDirty(ctx);
    ctx.flushDebouncedWrite = makeFlushDebouncedWrite(ctx);
    ctx.reconcileAfterQuiet = makeReconcileAfterQuiet(ctx);
    ctx.scheduleQuietResume = makeScheduleQuietResume(ctx);
    // Module-scoped action handles for the free-function exports.
    pendingFlush = (evenIfPaused) => {
        ctx.cancelWriteTimer();
        ctx.flushDebouncedWrite(evenIfPaused);
    };
    resumeFromPauseImpl = makeResumeFromPause(ctx);
    lastSyncedImpl = () => ({ tsx: ctx.lastSerializedTsx, css: ctx.lastSerializedCss });
    saveDivergedCanvasImpl = makeSaveDivergedCanvas(ctx);
    discardDivergedCanvasImpl = makeDiscardDivergedCanvas(ctx);
    const unsubAgent = useTerminalActivityStore.subscribe(makeAgentSubscriptionHandler(ctx));
    const unsubStore = useCanvasStore.subscribe(makeStoreSubscriptionHandler(ctx));
    // Second, independent consumer of the same store: the agent context file.
    // Kept separate from the save path so a context write can never delay or
    // interfere with a disk write. see docs/archive/2026-08-05-live-context-file-plan.md
    const unsubContext = useCanvasStore.subscribe(makeContextFileHandler());
    // Seed the file for whatever is already open, so an agent reading it
    // before the user's first click still gets the page.
    flushContextWrite();
    // Third consumer of the same store, and the only one that reads on demand
    // rather than on change: the MCP server asks, this answers.
    // see docs/archive/2026-08-06-mcp-server-plan.md
    const offMcp = installMcpResponder();
    // The built-in agent's edits, answered the same way.
    const offAgentTools = installAgentToolResponder();
    const offAck = window.scamp.onFileWriteAck((payload) => {
        handleAck(payload.writeId, payload.path);
    });
    const offFile = window.scamp.onFileChanged(makeFileChangedHandler(ctx));
    // Flush any queued write when the renderer is about to go away
    // (window close, full reload, HMR). The main-process IPC handler
    // completes the file write after the renderer is gone — Electron
    // keeps the main process alive long enough to drain its queue.
    const handleBeforeUnload = () => {
        ctx.cancelWriteTimer();
        ctx.flushDebouncedWrite();
        flushContextWrite();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    const offTheme = window.scamp.onThemeChanged(makeThemeChangedHandler());
    return () => {
        cancelContextWrite();
        unsubContext();
        offMcp();
        offAgentTools();
        ctx.cancelWriteTimer();
        pendingFlush = null;
        if (ctx.quietResumeTimer !== null) {
            clearTimeout(ctx.quietResumeTimer);
            ctx.quietResumeTimer = null;
        }
        ctx.quietWindow.clear();
        resumeFromPauseImpl = null;
        lastSyncedImpl = null;
        saveDivergedCanvasImpl = null;
        discardDivergedCanvasImpl = null;
        window.removeEventListener('beforeunload', handleBeforeUnload);
        unsubStore();
        unsubAgent();
        offFile();
        offAck();
        offTheme();
    };
};
