// syncBridge/writeDispatch.ts — split out of syncBridge.ts (5.4 safe partial).
import { registerPendingSave, reportError } from "./pendingSaves";
import { errorMessage } from "@shared/errorMessage";
import { useSaveStatusStore } from "@store/saveStatusSlice";
/**
 * The most recent dispatched attempt, regardless of current status.
 * `retryLastSave` uses this to re-issue after an error.
 */
let lastDispatchedAttempt = null;
/** The handlers the last page write was dispatched with, so a retry keeps them. */
let lastWriteHandlers = {};
export const dispatchPageWrite = (attempt, onConflict, onResult) => {
    useSaveStatusStore.getState().markSaving(attempt);
    lastDispatchedAttempt = attempt;
    lastWriteHandlers = { onConflict, onResult };
    const expected = new Set([attempt.tsxPath, attempt.cssPath]);
    void window.scamp
        .writeFile({
        tsxPath: attempt.tsxPath,
        cssPath: attempt.cssPath,
        tsxContent: attempt.tsxContent,
        cssContent: attempt.cssContent,
        ...(attempt.expectedTsxContent !== undefined
            ? { expectedTsxContent: attempt.expectedTsxContent }
            : {}),
        ...(attempt.expectedCssContent !== undefined
            ? { expectedCssContent: attempt.expectedCssContent }
            : {}),
    })
        .then((result) => {
        if (result.ok) {
            registerPendingSave(result.writeId, attempt, expected);
            onResult?.(true);
            return;
        }
        // Conflict: an external editor wrote between our last sync
        // and this dispatch. Drop the pending save state and hand
        // the actual content off to the caller's resync handler.
        useSaveStatusStore.getState().markClean();
        onConflict?.(result.conflict);
    })
        .catch((err) => {
        const message = errorMessage(err);
        reportError(message, attempt);
        onResult?.(false);
    });
};
const dispatchPatchWrite = (attempt) => {
    useSaveStatusStore.getState().markSaving(attempt);
    lastDispatchedAttempt = attempt;
    const expected = new Set([attempt.cssPath]);
    return window.scamp
        .patchFile({
        cssPath: attempt.cssPath,
        className: attempt.className,
        newDeclarations: attempt.newDeclarations,
        ...(attempt.media ? { media: attempt.media } : {}),
    })
        .then(({ writeId }) => {
        registerPendingSave(writeId, attempt, expected);
    })
        .catch((err) => {
        const message = errorMessage(err);
        reportError(message, attempt);
        throw err;
    });
};
/**
 * Commit a CSS panel patch through the save-status pipeline. The
 * CssPanel previously called `window.scamp.patchFile` directly; routing
 * through here keeps the "Saving…" / "Saved" transitions consistent
 * between canvas-driven writes and panel edits.
 */
export const savePatch = async (attempt) => {
    await dispatchPatchWrite({ kind: 'patch', ...attempt });
};
/**
 * Re-dispatch the last attempted save. Invoked by the error-state
 * retry button on the save-status indicator.
 */
export const retryLastSave = () => {
    const attempt = lastDispatchedAttempt;
    if (!attempt)
        return;
    if (attempt.kind === 'write') {
        dispatchPageWrite(attempt, lastWriteHandlers.onConflict, lastWriteHandlers.onResult);
    }
    else {
        void dispatchPatchWrite(attempt);
    }
};
