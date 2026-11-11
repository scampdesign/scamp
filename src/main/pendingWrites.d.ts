import type { FileWriteAckPayload } from '@shared/types';
/**
 * Pure state machine for "which paths are awaiting a chokidar
 * confirmation for a write we just issued?". Lives outside
 * `watcher.ts` so the logic can be exercised without Electron's
 * BrowserWindow dependency.
 */
export type PendingAck = {
    writeId: string;
    suppressChanged: boolean;
    /** What Scamp wrote: an event for anything else is someone else's write. */
    expected?: string;
    timer: ReturnType<typeof setTimeout>;
};
export type PendingWriteSender = (payload: FileWriteAckPayload) => void;
export type PendingWriteTracker = {
    register: (path: string, writeId: string, suppressChanged: boolean, expected?: string) => void;
    cancel: (path: string) => void;
    /**
     * Called from the chokidar event handler. If the path was pending,
     * emits the ack via the sender and returns whether the
     * `file:changed` broadcast should be suppressed.
     */
    consume: (path: string) => {
        writeId: string;
        suppressChanged: boolean;
        expected?: string;
    } | null;
    /** Size accessor for tests. */
    size: () => number;
};
/**
 * @param send          How to deliver an ack to the renderer.
 * @param expiryMs      If chokidar never fires for a registered path,
 *                      the ack is emitted anyway after this delay so
 *                      the indicator unwinds.
 */
export declare const createPendingWriteTracker: (send: PendingWriteSender, expiryMs: number) => PendingWriteTracker;
