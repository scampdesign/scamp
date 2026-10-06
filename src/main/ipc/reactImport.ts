import { promises as fs } from 'fs';
import { extname, relative, resolve } from 'path';
import { BrowserWindow, dialog, ipcMain } from 'electron';

import { IPC } from '@shared/ipcChannels';
import { listNamesAt, parseCallSite } from '@shared/reactSource';
import type {
  ReactImportInspectResult,
  ReactImportListNamesArgs,
  ReactImportListNamesResult,
  ReactImportProgress,
  ReactImportStartArgs,
  ReactImportStartResult,
} from '@shared/types';

import { inspectReactFolder, reactAppFolder, startReactApp } from '../reactImport/appServer';
import type { ReactFramework } from '../reactImport/detect';

/**
 * React app import, app window side. A folder is chosen through the
 * system dialog here, and only a folder chosen that way can be started:
 * the renderer can't name an arbitrary path and have its scripts run.
 * see docs/plans/react-import-plan.md
 */

const FRAMEWORK_LABEL: Readonly<Record<ReactFramework, string>> = {
  vite: 'Vite',
  next: 'Next.js',
  cra: 'Create React App',
};

/** Folders the user picked in the dialog, the only ones that can be started. */
const chosen = new Set<string>();

/** Source files a call site may name: the app's own code, nothing else. */
const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);

/**
 * List names for the given call sites, read from the app Scamp is running
 * for this project. Only files inside that app's folder are read.
 */
const listNames = async (args: ReactImportListNamesArgs): Promise<ReactImportListNamesResult> => {
  const folder = typeof args?.projectPath === 'string' ? reactAppFolder(args.projectPath) : null;
  if (folder === null || !Array.isArray(args.sites)) return {};
  const files = new Map<string, string[] | null>();
  const out: ReactImportListNamesResult = {};
  for (const site of args.sites.slice(0, 2000)) {
    if (typeof site !== 'string') continue;
    const call = parseCallSite(site);
    if (call === null || !SOURCE_EXTENSIONS.has(extname(call.path))) continue;
    const file = resolve(folder, `.${call.path.startsWith('/') ? call.path : `/${call.path}`}`);
    const inside = relative(folder, file);
    if (inside.startsWith('..') || inside === '') continue;
    if (!files.has(file)) {
      files.set(file, await fs.readFile(file, 'utf-8').then((text) => text.split('\n'), () => null));
    }
    const lines = files.get(file);
    const names = lines === null || lines === undefined ? null : listNamesAt(lines, call);
    if (names !== null) out[site] = names;
  }
  return out;
};

export const registerReactImportIpc = (): void => {
  ipcMain.handle(IPC.ReactImportListNames, (_e, args: ReactImportListNamesArgs) => listNames(args));

  ipcMain.handle(IPC.ReactImportInspect, async (e): Promise<ReactImportInspectResult> => {
    const owner = BrowserWindow.fromWebContents(e.sender);
    const options = {
      title: 'Choose a React project',
      buttonLabel: 'Choose',
      properties: ['openDirectory'] as Array<'openDirectory'>,
    };
    const picked = owner === null ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(owner, options);
    const folder = picked.filePaths[0];
    if (picked.canceled || folder === undefined) return { kind: 'cancelled' };

    const detected = await inspectReactFolder(folder);
    if (!detected.ok) return { kind: 'unsupported', folder, reason: detected.reason };
    chosen.add(folder);
    const { project } = detected;
    return {
      kind: 'ok',
      folder,
      name: project.name,
      framework: FRAMEWORK_LABEL[project.framework],
      installCommand: project.needsInstall ? `${project.packageManager} install` : null,
      // The port Scamp adds is its own business; this is the script the user knows.
      devCommand: `${project.packageManager} run ${project.devScript}`,
    };
  });

  ipcMain.handle(IPC.ReactImportStart, async (e, args: ReactImportStartArgs): Promise<ReactImportStartResult> => {
    if (typeof args?.folder !== 'string' || !chosen.has(args.folder) || typeof args.projectPath !== 'string') {
      return { ok: false, error: 'Choose the React project folder again.' };
    }
    const sender = e.sender;
    return startReactApp(args.projectPath, args.folder, (event: ReactImportProgress) => {
      if (!sender.isDestroyed()) sender.send(IPC.ReactImportProgress, event);
    });
  });
};
