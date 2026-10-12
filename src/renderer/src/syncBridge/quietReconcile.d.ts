import type { SaveContext } from './saveContext';
export declare const makeCancelWriteTimer: (ctx: SaveContext) => () => void;
/** Flush a queued debounced write against the CURRENT store state. */
export declare const makeFlushDebouncedWrite: (ctx: SaveContext) => (evenIfPaused?: boolean) => void;
/**
 * After the quiet window expires, decide whether the canvas matches disk
 * (resume cleanly → `saved`) or diverges (user picks Save / Discard
 * canvas → `diverged`).
 */
export declare const makeReconcileAfterQuiet: (ctx: SaveContext) => () => void;
/**
 * Schedule the resume check to fire when the quiet window expires. If a
 * fresh chokidar event extends the window before the timer fires, the
 * timer (re-)schedules itself rather than reconciling mid-burst.
 * Idempotent — re-calling cancels any prior timer.
 */
export declare const makeScheduleQuietResume: (ctx: SaveContext) => () => void;
/**
 * The "resume from pause" action behind the save-status indicator's
 * `Resume now` button: clear the quiet window + its timer and reconcile
 * immediately.
 */
export declare const makeResumeFromPause: (ctx: SaveContext) => () => void;
