import { ipcMain, shell } from 'electron';
import { join } from 'path';
import { IPC } from '@shared/ipcChannels';
import { listRoutes, readDevVarsKeys, readRouteFile, renameRouteForView, setRouteRender, writeRouteFile, } from './routeOps';
import { assertInsideActiveProject } from './pathContainment';
/** The path as given, once it's known to be the open project's. */
const inProject = (projectPath) => {
    assertInsideActiveProject(projectPath);
    return projectPath;
};
/** Register the routes IPC: listing, reading, the render export, generation, and `.dev.vars` keys. */
export const registerRoutesIpc = () => {
    ipcMain.handle(IPC.RoutesList, (_e, args) => listRoutes(inProject(args.projectPath)));
    ipcMain.handle(IPC.RoutesRead, (_e, args) => readRouteFile(inProject(args.projectPath), args.file));
    ipcMain.handle(IPC.RoutesSetRender, (_e, args) => setRouteRender(inProject(args.projectPath), args.file, args.render));
    ipcMain.handle(IPC.RoutesWrite, (_e, args) => writeRouteFile(inProject(args.projectPath), args.file, args.content));
    ipcMain.handle(IPC.RoutesRenameView, (_e, args) => renameRouteForView(inProject(args.projectPath), args.oldView, args.newView));
    ipcMain.handle(IPC.DevVarsRead, (_e, args) => readDevVarsKeys(inProject(args.projectPath)));
    // Open `.dev.vars` in the user's editor; the app never shows its values.
    ipcMain.handle(IPC.DevVarsOpen, async (_e, args) => {
        await shell.openPath(join(inProject(args.projectPath), '.dev.vars'));
    });
};
