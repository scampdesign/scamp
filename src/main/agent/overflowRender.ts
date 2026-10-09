import { BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { measureOverflowFn, type OverflowReport } from '@shared/overflowMeasure';
import type { AgentMeasureOverflowArgs, AgentMeasureOverflowResult } from '@shared/types';

import { assetsDirFor } from '../ipc/imageOps';
import { getProjectFormat } from '../ipc/projectFormatCache';
import { getWatchedPath } from '../watcher';

/**
 * Lays a view's HTML export out in a hidden window and measures what
 * overflows. The renderer builds the files (it has the export code); this
 * renders them as a browser would the exported site.
 * see docs/notes/agent-overflow-check.md
 */

const FINDING_LIMIT = 40;
const LOAD_TIMEOUT_MS = 8_000;
/** Web fonts change text widths; wait for them, but not forever. */
const FONTS_TIMEOUT_MS = 3_000;

const MIN_WIDTH = 240;
const MAX_WIDTH = 3_840;

/** A relative path inside the temp folder, or null. */
const safeRelative = (p: string): string | null => {
  const normal = path.normalize(p);
  return path.isAbsolute(normal) || normal.startsWith('..') || normal.length === 0 ? null : normal;
};

const withTimeout = <T>(work: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} took longer than ${ms / 1000}s`)), ms)),
  ]);

export const measureOverflow = async (args: AgentMeasureOverflowArgs): Promise<AgentMeasureOverflowResult> => {
  // Only the open project's assets are linked in, whatever the caller says.
  const projectPath = getWatchedPath();
  if (projectPath === null || path.resolve(projectPath) !== path.resolve(args.projectPath)) {
    return { ok: false, error: 'That project isn’t open.' };
  }
  if (!Number.isFinite(args.width)) return { ok: false, error: 'The width must be a number of pixels.' };
  const width = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, args.width)));

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-overflow-'));
  let win: BrowserWindow | null = null;
  try {
    for (const file of args.files) {
      const relative = safeRelative(file.path);
      if (relative === null) return { ok: false, error: `Refused a file outside the render folder: ${file.path}` };
      const target = path.join(dir, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, file.contents, 'utf-8');
    }
    const assets = assetsDirFor(projectPath, await getProjectFormat(projectPath));
    await fs.symlink(assets, path.join(dir, 'assets'), process.platform === 'win32' ? 'junction' : 'dir').catch(() => {
      // No assets folder: images render empty, which still lays out.
    });

    win = new BrowserWindow({
      show: false,
      width,
      height: 900,
      useContentSize: true,
      enableLargerThanScreen: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    await withTimeout(win.loadFile(path.join(dir, 'index.html')), LOAD_TIMEOUT_MS, 'Loading the view');
    // A scrollbar would take its width out of the layout; the canvas has none.
    await win.webContents.insertCSS('html { scrollbar-width: none; }');
    const report = (await withTimeout(
      win.webContents.executeJavaScript(
        `Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, ${FONTS_TIMEOUT_MS}))]).then(() => (${measureOverflowFn.toString()})(${FINDING_LIMIT}))`
      ),
      LOAD_TIMEOUT_MS,
      'Measuring the view'
    )) as OverflowReport;
    return { ok: true, report };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (win !== null && !win.isDestroyed()) win.destroy();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
};
