import { ipcMain } from 'electron';
import { IPC } from '@shared/ipcChannels';
import { ensureDevServer, getDevServerStatus, restartDevServer, stopDevServer, } from '../devServer/devServerManager';
import { assertInsideActiveProject } from './pathContainment';
/**
 * Register the IPC handlers preview mode needs. Idempotent — safe
 * to call once at app startup.
 *
 * The window functions are injected so this module doesn't pull in
 * the BrowserWindow code path directly.
 */
export const registerPreviewIpc = (windowApi) => {
    ipcMain.handle(IPC.PreviewOpen, async (_e, args) => {
        // Open (or reuse) the window for this project. The window's
        // renderer will subscribe to status changes via the IPC channel
        // PreviewStatusChanged; we kick the dev server in parallel so
        // the install / start work begins as soon as possible.
        // Runs `npm install` and a dev server in this folder.
        assertInsideActiveProject(args.projectPath);
        const win = await windowApi.open(args);
        void ensureDevServer(args.projectPath);
        return { windowId: win.id };
    });
    ipcMain.handle(IPC.PreviewStop, async (_e, args) => {
        await stopDevServer(args.projectPath);
    });
    ipcMain.handle(IPC.PreviewUpdate, (_e, args) => {
        // Update an existing preview window's active page + dropdown
        // list. No-op when no preview window is open for the project.
        windowApi.update(args);
    });
    /**
     * Close the preview window AND stop the dev server for a project.
     * Used by the renderer when the user closes the project itself —
     * we don't want the server outliving the project that's editing it.
     */
    ipcMain.handle(IPC.PreviewClose, async (_e, args) => {
        windowApi.close(args.projectPath);
        await stopDevServer(args.projectPath);
    });
    ipcMain.handle(IPC.PreviewRestart, async (_e, args) => {
        assertInsideActiveProject(args.projectPath);
        await restartDevServer(args.projectPath);
    });
    ipcMain.handle(IPC.PreviewGetStatus, (_e, args) => {
        return getDevServerStatus(args.projectPath);
    });
};
