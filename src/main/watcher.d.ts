import { BrowserWindow } from 'electron';
export declare const initWatcher: (win: BrowserWindow) => void;
export declare const disposeWatcher: () => void;
export declare const watchProject: (folderPath: string) => Promise<void>;
export declare const registerPendingWrite: (path: string, writeId: string, suppressChanged: boolean, expected?: string) => void;
/**
 * Cancel a previously registered pending write — used when the write
 * itself failed, so no ack ever gets emitted (the renderer will
 * transition to `error` via the IPC rejection path instead).
 */
export declare const cancelPendingWrite: (path: string) => void;
/**
 * Legacy suppression entry-point for flows that have no save-status
 * indicator to acknowledge (e.g. page rename). Registers a pending
 * write with a throwaway id — the renderer isn't listening for it.
 */
export declare const suppressNextChange: (path: string) => void;
export declare const getWatchedPath: () => string | null;
/**
 * Broadcast `ProjectPagesChanged` to the renderer so it re-reads the
 * project from disk. Used after a snapshot restore (whose copies are
 * suppressed at the watcher) to drive a full project refresh through the
 * existing pages-changed path.
 */
export declare const notifyPagesChanged: () => void;
