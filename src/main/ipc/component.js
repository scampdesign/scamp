import { randomUUID } from 'crypto';
import { ipcMain } from 'electron';
import { IPC } from '@shared/ipcChannels';
import { cancelPendingWrite, registerPendingWrite } from '../watcher';
import { assertInsideActiveProject } from './pathContainment';
import { getProjectFormat } from './projectFormatCache';
import { componentPathsFor, createComponent, deleteComponent, readComponent, readComponentThumbnail, writeComponentThumbnail, } from './componentOps';
/**
 * Wire up the Phase 1 component IPC channels. Mirror of
 * `registerPageIpc` — every handler resolves the project format
 * from the cached lookup before delegating, so callers don't
 * have to pass it explicitly.
 *
 * Rename / lockProp / renameProp / createFromElement land in
 * later phases (see `docs/plans/2026-05-17-components.md`).
 */
export const registerComponentIpc = () => {
    ipcMain.handle(IPC.ComponentCreate, async (_e, args) => {
        assertInsideActiveProject(args.projectPath);
        const format = await getProjectFormat(args.projectPath);
        // Suppress the chokidar `add` broadcast for both files: the
        // renderer's `loadComponent` already has the content via this
        // IPC's return value, so a `file:changed` round-trip would
        // only race the user's first interaction. Without this, the
        // syncBridge echo guard misses (its `lastSerialized` cache
        // trails the chokidar event) and the chokidar handler
        // reloads on top of any rect the user has just drawn.
        // see docs/notes/component-scaffold-roundtrip.md
        const { tsxPath, cssPath } = componentPathsFor(args.projectPath, args.componentName, args.kind ?? 'component');
        const writeId = randomUUID();
        registerPendingWrite(tsxPath, writeId, true);
        registerPendingWrite(cssPath, writeId, true);
        try {
            return await createComponent(args, format);
        }
        catch (err) {
            cancelPendingWrite(tsxPath);
            cancelPendingWrite(cssPath);
            throw err;
        }
    });
    ipcMain.handle(IPC.ComponentDelete, async (_e, args) => {
        assertInsideActiveProject(args.projectPath);
        const format = await getProjectFormat(args.projectPath);
        return deleteComponent(args, format);
    });
    ipcMain.handle(IPC.ComponentRead, async (_e, args) => {
        assertInsideActiveProject(args.projectPath);
        const format = await getProjectFormat(args.projectPath);
        return readComponent(args, format);
    });
    ipcMain.handle(IPC.ComponentWriteThumbnail, async (_e, args) => {
        const format = await getProjectFormat(args.projectPath);
        return writeComponentThumbnail(args, format);
    });
    ipcMain.handle(IPC.ComponentReadThumbnail, async (_e, args) => {
        const format = await getProjectFormat(args.projectPath);
        return readComponentThumbnail(args, format);
    });
};
