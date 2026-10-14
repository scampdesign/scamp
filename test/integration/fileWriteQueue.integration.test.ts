import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { FilePatchArgs, FilePatchResult, FileWriteArgs, FileWriteResult } from '../../src/shared/types';

/**
 * The page write and the CSS-panel patch for one stylesheet run one after
 * the other. They used to interleave — the patch read the file, the write
 * replaced it, the patch wrote its copy back — and the write's edit was
 * gone while it reported success.
 * Audit item 15 in docs/archive/2026-10-12-audit-2026-10-12.md.
 */

const handlers = new Map<string, (event: unknown, args: unknown) => Promise<unknown>>();
let projectRoot = '';

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) => handlers.set(channel, fn) },
}));
vi.mock('../../src/main/watcher', () => ({
  getWatchedPath: () => projectRoot,
  registerPendingWrite: () => {},
  cancelPendingWrite: () => {},
}));

const { registerFileIpc } = await import('../../src/main/ipc/file');
const { IPC } = await import('../../src/shared/ipcChannels');
registerFileIpc();

const call = <T>(channel: string, args: unknown): Promise<T> => {
  const fn = handlers.get(channel);
  if (fn === undefined) throw new Error(`no handler for ${channel}`);
  return fn(null, args) as Promise<T>;
};

const TSX = '<div data-scamp-id="root" className={styles.root} />\n';
const CSS = '.root {\n  width: 100%;\n}\n\n.card_a1b2 {\n  color: red;\n}\n';

describe('file:write and file:patch on one stylesheet', () => {
  let tsxPath = '';
  let cssPath = '';

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-write-queue-'));
    tsxPath = path.join(projectRoot, 'home.tsx');
    cssPath = path.join(projectRoot, 'home.module.css');
    await fs.writeFile(tsxPath, TSX);
    await fs.writeFile(cssPath, CSS);
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('never reports a write as saved while a patch overwrites it', async () => {
    const patch = call<FilePatchResult>(IPC.FilePatch, {
      cssPath,
      className: 'card_a1b2',
      newDeclarations: 'color: blue;',
    } satisfies FilePatchArgs);
    const write = call<FileWriteResult>(IPC.FileWrite, {
      tsxPath,
      cssPath,
      tsxContent: TSX,
      cssContent: CSS.replace('width: 100%;', 'width: 50%;'),
      expectedTsxContent: TSX,
      expectedCssContent: CSS,
    } satisfies FileWriteArgs);
    const [, written] = await Promise.all([patch, write]);

    const css = await fs.readFile(cssPath, 'utf-8');
    // The patch went first, so the write must see its change: refused as a
    // conflict (the renderer then merges), never "saved" and then lost.
    expect(css).toContain('color: blue;');
    if (written.ok) expect(css).toContain('width: 50%;');
    else expect(written.conflict.actualCssContent).toContain('color: blue;');
  });
});
