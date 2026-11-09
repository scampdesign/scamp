import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';

import type { EmbeddedGitResult } from '@shared/types';

import { changedBetween, changedFiles } from './ownAgent';

/**
 * Every agent run's files, before and after, so Cmd+Z can put back what a
 * run wrote, and redo it. One record per run, for Scamp's own agent and the
 * user's alike: which files a run changed comes from git, compared with a
 * snapshot taken as it started. Undo refuses a file that changed since the
 * run, so it never throws away an edit made outside Scamp.
 * see docs/plans/embedded-canvas-gaps.md (P2)
 */

export type RunSnapshot = { hashes: Map<string, string>; contents: Map<string, Buffer | null> };

export type RunFile = { path: string; before: Buffer | null; after: Buffer | null };
export type RunRecord = { id: string; files: RunFile[] };

const read = (path: string): Promise<Buffer | null> => fs.readFile(path).catch(() => null);

/** A file as HEAD has it, or null when HEAD has no such file. */
const headContent = (folder: string, path: string): Promise<Buffer | null> =>
  new Promise((done) => {
    execFile('git', ['show', `HEAD:./${path}`], { cwd: folder, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      done(err === null ? stdout : null);
    });
  });

/** What's changed from HEAD as a run starts, contents included: the run's "before" for those files. */
export const snapshotRun = async (folder: string): Promise<RunSnapshot> => {
  const hashes = await changedFiles(folder);
  const contents = new Map<string, Buffer | null>();
  for (const path of hashes.keys()) contents.set(path, await read(join(folder, path)));
  return { hashes, contents };
};

/** The files the run changed, with their content before it and now. */
export const recordRun = async (folder: string, id: string, before: RunSnapshot): Promise<RunRecord> => {
  const changed = changedBetween(before.hashes, await changedFiles(folder));
  const files: RunFile[] = [];
  for (const path of changed) {
    const was = before.contents.has(path) ? (before.contents.get(path) ?? null) : await headContent(folder, path);
    files.push({ path, before: was, after: await read(join(folder, path)) });
  }
  return { id, files };
};

const same = (a: Buffer | null, b: Buffer | null): boolean => (a === null || b === null ? a === b : a.equals(b));

const put = async (path: string, content: Buffer | null): Promise<void> => {
  if (content === null) {
    await fs.rm(path, { force: true });
    return;
  }
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, content);
};

/** Put each file of the run back to `from` → `to`, if every one is still as the run left it. */
const swap = async (folder: string, run: RunRecord, direction: 'undo' | 'redo'): Promise<EmbeddedGitResult> => {
  const expect = (f: RunFile): Buffer | null => (direction === 'undo' ? f.after : f.before);
  const changed: string[] = [];
  for (const f of run.files) if (!same(await read(join(folder, f.path)), expect(f))) changed.push(f.path);
  if (changed.length > 0) {
    return { ok: false, code: 'changed', error: `${changed.join(', ')} changed since, so Scamp left ${changed.length === 1 ? 'it' : 'them'} as ${changed.length === 1 ? 'it is' : 'they are'}.` };
  }
  for (const f of run.files) await put(join(folder, f.path), direction === 'undo' ? f.before : f.after);
  return { ok: true };
};

export const undoRun = (folder: string, run: RunRecord): Promise<EmbeddedGitResult> => swap(folder, run, 'undo');
export const redoRun = (folder: string, run: RunRecord): Promise<EmbeddedGitResult> => swap(folder, run, 'redo');
