// Debounce-timer control + the quiet-window reconcile logic that decides,
// when an external-edit burst settles, whether the canvas matches disk
// (resume cleanly) or diverges. Lifted out of initSyncBridge (Phase 5.4);
// shares the cache + quiet window via `ctx`.
import { generateCode } from '@lib/generateCode';
import { useCanvasStore } from '@store/canvasSlice';
import { useSaveStatusStore } from '@store/saveStatusSlice';
import { selectSyncPaused, useTerminalActivityStore } from '@store/terminalActivitySlice';
import { importNameForTarget, toEditTarget } from './editTarget';
export const makeCancelWriteTimer = (ctx) => () => {
    if (ctx.writeTimer !== null) {
        clearTimeout(ctx.writeTimer);
        ctx.writeTimer = null;
    }
};
/** Flush a queued debounced write against the CURRENT store state. */
export const makeFlushDebouncedWrite = (ctx) => (evenIfPaused = false) => {
    // A fired timer is spent; left set, it reads as an unsaved edit forever.
    ctx.writeTimer = null;
    const state = useCanvasStore.getState();
    // A snapshot preview is on the canvas in memory only; writing it here
    // (page switch, project close) put the old version over the live page.
    if (state.snapshotPreview !== null)
        return;
    const target = toEditTarget(state.activePage, state.activeComponent);
    if (!target)
        return;
    ctx.writeIfDirty(state.elements, state.rootElementId, target, state.pageCustomMediaBlocks, state.pageKeyframesBlocks, false, evenIfPaused);
};
/**
 * After the quiet window expires, decide whether the canvas matches disk
 * (resume cleanly → `saved`) or diverges (user picks Save / Discard
 * canvas → `diverged`).
 */
export const makeReconcileAfterQuiet = (ctx) => () => {
    // Decision #3: don't resume while the OTHER signal still says
    // pause. If the user clicks `Resume now` we'll still bypass this
    // (resumeFromPause clears the quiet window and we land here; but
    // the agent flag is checked separately and the user's explicit
    // override should win even mid-burst).
    if (selectSyncPaused(useTerminalActivityStore.getState())) {
        // Quiet may have expired, but the user's pause still holds.
        useSaveStatusStore.getState().markPaused('manual');
        return;
    }
    const state = useCanvasStore.getState();
    const target = toEditTarget(state.activePage, state.activeComponent);
    if (!target) {
        useSaveStatusStore.getState().markResumed(null);
        return;
    }
    const code = generateCode({
        elements: state.elements,
        rootId: state.rootElementId,
        pageName: target.name,
        breakpoints: state.breakpoints,
        customMediaBlocks: state.pageCustomMediaBlocks,
        pageKeyframesBlocks: state.pageKeyframesBlocks,
        cssModuleImportName: importNameForTarget(target, state.projectFormat),
        isComponent: target.kind === 'component',
    });
    if (code.tsx === ctx.lastSerializedTsx &&
        code.css === ctx.lastSerializedCss) {
        useSaveStatusStore.getState().markResumed(null);
        return;
    }
    // Canvas state differs from what's on disk. Two interpretations:
    //
    //   (a) The user made a canvas edit during the quiet window —
    //       it was deferred by `writeIfDirty`'s quietWindow guard
    //       and is now waiting to be flushed.
    //   (b) The user typed CSS directly into the file (or via the
    //       raw-CSS panel) that doesn't round-trip cleanly through
    //       Scamp's typed model (e.g. `letter-spacing` on a rect —
    //       parseCode stores it on the element, generateCode drops
    //       it because the typed emitter is text-only). Canvas
    //       state regenerates to a different string than what's on
    //       disk, but the on-disk version is the user's intent.
    //
    // We tell these apart by remembering whether `state.elements`
    // changed during the quiet window. If yes (a) → flush.
    // If no (b) → leave disk alone, just resume.
    if (ctx.canvasChangedDuringQuiet) {
        ctx.flushDebouncedWrite();
    }
    ctx.canvasChangedDuringQuiet = false;
    useSaveStatusStore.getState().markResumed(null);
};
/**
 * Schedule the resume check to fire when the quiet window expires. If a
 * fresh chokidar event extends the window before the timer fires, the
 * timer (re-)schedules itself rather than reconciling mid-burst.
 * Idempotent — re-calling cancels any prior timer.
 */
export const makeScheduleQuietResume = (ctx) => {
    const scheduleQuietResume = () => {
        if (ctx.quietResumeTimer !== null) {
            clearTimeout(ctx.quietResumeTimer);
            ctx.quietResumeTimer = null;
        }
        const remaining = ctx.quietWindow.remainingMs();
        if (remaining === 0) {
            ctx.reconcileAfterQuiet();
            return;
        }
        // +50ms grace so the timer fires AFTER the window expires,
        // not exactly on it. Avoids a tight loop on slow event loops.
        ctx.quietResumeTimer = setTimeout(() => {
            ctx.quietResumeTimer = null;
            if (ctx.quietWindow.isQuiet()) {
                // Extended in flight; re-schedule for the new deadline.
                scheduleQuietResume();
                return;
            }
            ctx.reconcileAfterQuiet();
        }, remaining + 50);
    };
    return scheduleQuietResume;
};
/**
 * The "resume from pause" action behind the save-status indicator's
 * `Resume now` button: clear the quiet window + its timer and reconcile
 * immediately.
 */
export const makeResumeFromPause = (ctx) => () => {
    ctx.quietWindow.clear();
    if (ctx.quietResumeTimer !== null) {
        clearTimeout(ctx.quietResumeTimer);
        ctx.quietResumeTimer = null;
    }
    ctx.reconcileAfterQuiet();
};
