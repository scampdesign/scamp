import { ipcMain, shell } from 'electron';
import { join } from 'path';
import { IPC } from '@shared/ipcChannels';
import type {
  DevVarsReadArgs,
  DevVarsReadResult,
  RouteFile,
  RouteReadArgs,
  RouteSetRenderArgs,
  RouteRenameViewArgs,
  RouteWriteArgs,
  RoutesListArgs,
} from '@shared/types';
import {
  listRoutes,
  readDevVarsKeys,
  readRouteFile,
  renameRouteForView,
  setRouteRender,
  writeRouteFile,
} from './routeOps';
import { assertInsideActiveProject } from './pathContainment';

/** The path as given, once it's known to be the open project's. */
const inProject = (projectPath: string): string => {
  assertInsideActiveProject(projectPath);
  return projectPath;
};

/** Register the routes IPC: listing, reading, the render export, generation, and `.dev.vars` keys. */
export const registerRoutesIpc = (): void => {
  ipcMain.handle(IPC.RoutesList, (_e, args: RoutesListArgs): Promise<RouteFile[]> =>
    listRoutes(inProject(args.projectPath))
  );
  ipcMain.handle(IPC.RoutesRead, (_e, args: RouteReadArgs): Promise<string> =>
    readRouteFile(inProject(args.projectPath), args.file)
  );
  ipcMain.handle(IPC.RoutesSetRender, (_e, args: RouteSetRenderArgs): Promise<void> =>
    setRouteRender(inProject(args.projectPath), args.file, args.render)
  );
  ipcMain.handle(IPC.RoutesWrite, (_e, args: RouteWriteArgs): Promise<void> =>
    writeRouteFile(inProject(args.projectPath), args.file, args.content)
  );
  ipcMain.handle(IPC.RoutesRenameView, (_e, args: RouteRenameViewArgs): Promise<string | null> =>
    renameRouteForView(inProject(args.projectPath), args.oldView, args.newView)
  );
  ipcMain.handle(IPC.DevVarsRead, (_e, args: DevVarsReadArgs): Promise<DevVarsReadResult> =>
    readDevVarsKeys(inProject(args.projectPath))
  );
  // Open `.dev.vars` in the user's editor; the app never shows its values.
  ipcMain.handle(IPC.DevVarsOpen, async (_e, args: DevVarsReadArgs): Promise<void> => {
    await shell.openPath(join(inProject(args.projectPath), '.dev.vars'));
  });
};
