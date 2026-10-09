import type { SnapshotRestoreResult } from '@shared/types';
/**
 * Restore a snapshot and have the renderer pick it up. Shared by the
 * History panel and the Scamp Agent's Undo AI session.
 *
 * Page and component files are suppressed at the watcher (one burst, one
 * full re-read through ProjectPagesChanged). `theme.css` and `DESIGN.md`
 * are deliberately NOT: the pages re-read doesn't read them, so letting
 * the watcher see them is what reloads the theme and the docs — otherwise
 * a restored project showed its old design in the current colours.
 */
export declare const restoreSnapshotAndReload: (projectPath: string, snapshotId: string, options?: {
    /**
     * Let each restored page file broadcast as Scamp's own write, so the
     * open page reloads from it. The History panel doesn't need this — its
     * preview already put the snapshot on the canvas — but Undo AI session
     * restores with no preview, and the project re-read alone skips a page
     * whose file now matches what it last read.
     */
    reloadOpenPage?: boolean;
}) => Promise<SnapshotRestoreResult>;
/**
 * Wire up the project-snapshot IPC channels. Every handler resolves the
 * project format from the cached lookup before delegating, mirroring the
 * page / component handlers. All `.scamp/` file I/O lives in snapshotOps.
 *
 * Restore registers a suppressed pending-write for every file it copies
 * back, so the watcher treats the burst as Scamp's own writes (no
 * `agent_edit` snapshot, no per-file reload), then broadcasts
 * ProjectPagesChanged so the renderer re-reads the whole project from
 * disk through the existing refresh path. The renderer additionally
 * clears the in-session undo stack on a successful restore.
 */
export declare const registerSnapshotIpc: () => void;
