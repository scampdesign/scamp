import { randomUUID } from 'crypto';
import { ipcMain } from 'electron';
import { IPC } from '@shared/ipcChannels';
import { designMdPathFor } from './designMdOps';
import { assertInsideActiveProject } from './pathContainment';
import { getProjectFormat } from './projectFormatCache';
import { themePathFor } from './themeOps';
import { notifyPagesChanged, registerPendingWrite } from '../watcher';
import { createSnapshot, deleteSnapshot, listSnapshots, readSnapshotPage, restoreSnapshot, } from './snapshotOps';
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
export const restoreSnapshotAndReload = async (projectPath, snapshotId, options = {}) => {
    const format = await getProjectFormat(projectPath);
    const designFiles = new Set([themePathFor(projectPath, format), designMdPathFor(projectPath, format)]);
    const writeId = randomUUID();
    const result = await restoreSnapshot(projectPath, format, snapshotId, {
        beforeWrite: (dest) => {
            if (!designFiles.has(dest))
                registerPendingWrite(dest, writeId, options.reloadOpenPage !== true);
        },
    });
    if (!result.ok) {
        return { ok: false, error: result.error ?? 'Restore failed.' };
    }
    notifyPagesChanged();
    return { ok: true, snapshotId };
};
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
export const registerSnapshotIpc = () => {
    ipcMain.handle(IPC.SnapshotCreate, async (_e, args) => {
        assertInsideActiveProject(args.projectPath);
        const format = await getProjectFormat(args.projectPath);
        const snapshot = await createSnapshot(args.projectPath, format, args.trigger, args.label);
        return { snapshot };
    });
    ipcMain.handle(IPC.SnapshotList, async (_e, args) => {
        assertInsideActiveProject(args.projectPath);
        return { snapshots: await listSnapshots(args.projectPath) };
    });
    ipcMain.handle(IPC.SnapshotRestore, async (_e, args) => {
        assertInsideActiveProject(args.projectPath);
        return restoreSnapshotAndReload(args.projectPath, args.snapshotId);
    });
    ipcMain.handle(IPC.SnapshotDelete, async (_e, args) => {
        assertInsideActiveProject(args.projectPath);
        return deleteSnapshot(args.projectPath, args.snapshotId);
    });
    ipcMain.handle(IPC.SnapshotReadPage, async (_e, args) => {
        assertInsideActiveProject(args.projectPath);
        assertInsideActiveProject(args.tsxPath);
        assertInsideActiveProject(args.cssPath);
        return readSnapshotPage(args.projectPath, args.snapshotId, args.tsxPath, args.cssPath);
    });
};
