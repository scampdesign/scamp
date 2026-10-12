import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { IPC } from '@shared/ipcChannels';
import type {
  FilePatchArgs,
  FilePatchResult,
  FileWriteArgs,
  FileWriteResult,
} from '@shared/types';
import { patchClassBlock } from '@shared/patchClass';
import { cancelPendingWrite, registerPendingWrite } from '../watcher';
import { checkWriteConflict } from './fileConflict';
import { atomicWrite } from './fileOps';
import { assertInsideActiveProject } from './pathContainment';

const inFlight = new Set<Promise<unknown>>();

const tracked = <T>(write: Promise<T>): Promise<T> => {
  inFlight.add(write);
  const done = (): void => {
    inFlight.delete(write);
  };
  write.then(done, done);
  return write;
};

/** Resolves once every page write main has started is on disk (or failed). Quit waits on it. */
export const settleFileWrites = async (): Promise<void> => {
  await Promise.allSettled([...inFlight]);
};

const handleWrite = async (args: FileWriteArgs): Promise<FileWriteResult> => {
  assertInsideActiveProject(args.tsxPath);
  assertInsideActiveProject(args.cssPath);
  const conflict = await checkWriteConflict(args);
  if (conflict) {
    return { ok: false, conflict };
  }

  const writeId = randomUUID();
  // Page writes suppress `file:changed` — the renderer generated the
  // content itself and re-parsing it would just cause flicker. The
  // ack still fires so the save-status indicator can transition.
  registerPendingWrite(args.tsxPath, writeId, true);
  registerPendingWrite(args.cssPath, writeId, true);
  try {
    await atomicWrite(args.tsxPath, args.tsxContent);
    await atomicWrite(args.cssPath, args.cssContent);
  } catch (err) {
    cancelPendingWrite(args.tsxPath);
    cancelPendingWrite(args.cssPath);
    throw err;
  }
  return { ok: true, writeId };
};

/**
 * Patch a single class block in a CSS module file via postcss. The rest
 * of the file is left untouched.
 *
 * Unlike `handleWrite`, we let the `file:changed` broadcast fire — the
 * properties panel relies on the resulting round-trip through
 * `parseCode` to refresh the canvas. The ack is additive: it only
 * drives the save-status indicator.
 */
const handlePatch = async (args: FilePatchArgs): Promise<FilePatchResult> => {
  assertInsideActiveProject(args.cssPath);
  const writeId = randomUUID();
  registerPendingWrite(args.cssPath, writeId, false);
  try {
    const original = await fs.readFile(args.cssPath, 'utf-8');
    const next = patchClassBlock(
      original,
      args.className,
      args.newDeclarations,
      args.media
    );
    await atomicWrite(args.cssPath, next);
  } catch (err) {
    cancelPendingWrite(args.cssPath);
    throw err;
  }
  return { writeId };
};

export const registerFileIpc = (): void => {
  ipcMain.handle(IPC.FileWrite, (_e, args: FileWriteArgs) => tracked(handleWrite(args)));
  ipcMain.handle(IPC.FilePatch, (_e, args: FilePatchArgs) => tracked(handlePatch(args)));
};
