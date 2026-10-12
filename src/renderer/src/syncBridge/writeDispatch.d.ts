import { type LastWriteAttempt } from "@store/saveStatusSlice";
/**
 * Dispatch a page write and wire its IPC result + ack correlation
 * into the save-status state machine. Both writeIfDirty (debounced)
 * and retryLastSave go through here so the tracking is consistent.
 */
/**
 * Conflict callback signature for `dispatchPageWrite`. Fires when
 * main's optimistic-concurrency check rejects the write because
 * disk has drifted since the renderer last synced. The argument
 * is the on-disk content at the moment of rejection — the caller
 * adopts it as the new "synced" state (parse + reloadElements
 * inside initSyncBridge's scope) so the canvas reflects the
 * external editor's view.
 */
type WriteConflictHandler = (conflict: {
    actualTsxContent: string;
    actualCssContent: string;
}) => void;
/** Whether main wrote the files (`true`) or the IPC call failed (`false`). Not called on a conflict. */
type WriteResultHandler = (written: boolean) => void;
export declare const dispatchPageWrite: (attempt: Extract<LastWriteAttempt, {
    kind: "write";
}>, onConflict?: WriteConflictHandler, onResult?: WriteResultHandler) => void;
/**
 * Commit a CSS panel patch through the save-status pipeline. The
 * CssPanel previously called `window.scamp.patchFile` directly; routing
 * through here keeps the "Saving…" / "Saved" transitions consistent
 * between canvas-driven writes and panel edits.
 */
export declare const savePatch: (attempt: {
    cssPath: string;
    className: string;
    newDeclarations: string;
    media?: {
        maxWidth: number;
    };
}) => Promise<void>;
/**
 * Re-dispatch the last attempted save. Invoked by the error-state
 * retry button on the save-status indicator.
 */
export declare const retryLastSave: () => void;
export {};
