import { app, ipcMain } from 'electron';
import { promises as fs, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { IPC } from '@shared/ipcChannels';
import type { Settings } from '@shared/types';
import { atomicWrite } from './fileOps';
import { DEFAULT_SETTINGS, parseSettingsBlob } from './settingsOps';

/**
 * Persistent app-level settings stored next to the recent projects list in
 * Electron's userData directory. Right now this is only the default
 * projects folder; the file format is a JSON object so we can grow it
 * without a migration. Parsing/defaulting lives in `settingsOps.ts`.
 */

const storePath = (): string => join(app.getPath('userData'), 'settings.json');

const readStore = async (): Promise<Settings> => {
  try {
    const raw = await fs.readFile(storePath(), 'utf-8');
    return parseSettingsBlob(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

/**
 * Synchronous read for the main process's startup path. Sentry's
 * `init()` decision needs to happen before the BrowserWindow is
 * created, which means before `app.whenReady`'s promise can
 * resolve an async read. Sync + try/catch + defaults is the
 * safest shape — any error (file missing, malformed JSON, perm
 * issue) returns the defaults with `sentryOptIn: null` so the
 * renderer's opt-in prompt fires.
 */
export const readSettingsSync = (): Settings => {
  try {
    const raw = readFileSync(storePath(), 'utf-8');
    return parseSettingsBlob(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

const writeStore = async (settings: Settings): Promise<void> => {
  const path = storePath();
  // Make sure the userData directory exists. Electron normally creates it
  // on startup, but on a fresh install the very first write can land
  // before any other code has touched the directory, and fs.writeFile
  // does not create parent dirs.
  await fs.mkdir(dirname(path), { recursive: true });
  await atomicWrite(path, JSON.stringify(settings, null, 2));
};

const getSettings = async (): Promise<Settings> => readStore();

const setDefaultFolder = async (path: string | null): Promise<Settings> => {
  const current = await readStore();
  const next: Settings = { ...current, defaultProjectsFolder: path };
  await writeStore(next);
  return next;
};

const updateSettings = async (patch: Partial<Settings>): Promise<Settings> => {
  const current = await readStore();
  const next: Settings = { ...current, ...patch };
  // Opting out drops the install id, so opting back in later mints a fresh
  // one rather than silently rejoining the old identity. Handled here rather
  // than at the call site so every path that flips the toggle gets it.
  if (patch.sentryOptIn === false) next.installId = null;
  await writeStore(next);
  return next;
};

/**
 * Persist a freshly-generated install id. Separate from `updateSettings` so
 * the Sentry init path can save an id it just minted without racing a
 * renderer-driven settings write.
 */
export const persistInstallId = async (installId: string): Promise<void> => {
  const current = await readStore();
  if (current.installId === installId) return;
  await writeStore({ ...current, installId });
};

export const registerSettingsIpc = (): void => {
  ipcMain.handle(IPC.SettingsGet, async () => {
    try {
      return await getSettings();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[settings:get] failed', e);
      throw e;
    }
  });
  ipcMain.handle(IPC.SettingsSetDefaultFolder, async (_e, args: { path: string | null }) => {
    try {
      return await setDefaultFolder(args.path);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[settings:setDefaultFolder] failed', e);
      throw e;
    }
  });
  ipcMain.handle(IPC.SettingsUpdate, async (_e, patch: Partial<Settings>) => {
    try {
      return await updateSettings(patch);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[settings:update] failed', e);
      throw e;
    }
  });
};

export { getSettings };
