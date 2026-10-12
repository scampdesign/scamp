export { savePatch, retryLastSave } from './syncBridge/writeDispatch';
export { armTargetSwapSuppression, disarmTargetSwapSuppression, } from './syncBridge/targetSwapSuppression';
/**
 * Write the active target's pending edits now. Writes even while sync is
 * paused, because the callers are about to move the canvas off the target
 * and the edit would otherwise exist only in memory. Pass
 * `{ respectPause: true }` for a flush that isn't leaving anything.
 */
export declare const flushPendingPageWrite: (options?: {
    respectPause?: boolean;
}) => void;
/** Save-status indicator's `Resume now` button. */
export declare const resumeFromPause: () => void;
/**
 * Phase 5.2 — force-write the canvas's current state to disk, overwriting
 * whatever the external editor wrote. Diverged popover's `Save canvas`.
 */
export declare const saveDivergedCanvas: () => void;
/**
 * Phase 5.2 — abandon the canvas's in-memory state and reload from disk.
 * Diverged popover's `Discard canvas`.
 */
export declare const discardDivergedCanvas: () => void;
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
export declare const initSyncBridge: () => (() => void);
