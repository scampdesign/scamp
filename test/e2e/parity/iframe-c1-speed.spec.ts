import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { ElectronApplication, Page } from '@playwright/test';

import { test, expect, stubOpenDialog } from '../fixtures/app';
import { openComponentsSection } from '../fixtures/components';
import { pageRoot } from '../fixtures/selectors';

/**
 * Experiment (option C1): speed of today's canvas against the iframe canvas
 * on real pages, and 30 read-only iframes under one transform. Prints its
 * numbers; asserts nothing about them. Copies each project to a temp folder,
 * so the originals are never opened. see docs/plans/canvas-rendering-options.md
 */

type Bench = {
  set: (on: boolean) => void;
  stats: { firstDrawMs: number | null; updates: Array<{ buildMs: number; patchMs: number }> };
  benchEdits: (count: number) => Promise<unknown>;
  benchFrames: (count: number, keep?: boolean) => Promise<unknown>;
  removeFrames: () => void;
};

/** Resident memory of the window's renderer process, in MB (Linux). */
const rendererRssMb = async (app: ElectronApplication): Promise<number> => {
  const pid = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.getOSProcessId() ?? 0);
  const status = await fs.readFile(`/proc/${pid}/status`, 'utf-8');
  const kb = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0);
  return Math.round(kb / 1024);
};

const bench = <T>(window: Page, fn: (b: Bench) => T | Promise<T>): Promise<T> =>
  window.evaluate(
    (src) => {
      const b = (globalThis as unknown as { __scampIframeCanvas: Bench }).__scampIframeCanvas;
      return (new Function('b', `return (${src})(b)`) as (b: Bench) => unknown)(b) as T;
    },
    fn.toString()
  );

const copyProject = async (from: string): Promise<string> => {
  const to = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-c1-speed-')), path.basename(from));
  await fs.cp(from, to, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}node_modules`) && !src.includes(`${path.sep}.git`),
  });
  return to;
};

const openProject = async (app: ElectronApplication, window: Page, dir: string): Promise<void> => {
  await expect(pageRoot(window)).toBeVisible();
  await window.getByRole('button', { name: '← Projects' }).click();
  await stubOpenDialog(app, dir);
  await window.getByRole('button', { name: 'Open Project' }).click();
  await expect(window.getByTestId('canvas-frame')).toBeVisible();
};

const measurePage = async (app: ElectronApplication, window: Page, label: string, frames: boolean): Promise<void> => {
  await window.waitForTimeout(1500);
  const today = await bench(window, (b) => b.benchEdits(20));
  const rssToday = await rendererRssMb(app);
  await bench(window, (b) => b.set(true));
  await expect(window.locator('[data-testid="iframe-canvas"] iframe').first()).toBeVisible();
  await window.waitForTimeout(1500);
  const firstDrawMs = await bench(window, (b) => b.stats.firstDrawMs);
  const before = await bench(window, (b) => b.stats.updates.length);
  const iframe = await bench(window, (b) => b.benchEdits(20));
  const updates = await bench(window, (b) => b.stats.updates);
  const split = updates.slice(before);
  const avg = (k: 'buildMs' | 'patchMs'): number =>
    Math.round((split.reduce((n, u) => n + u[k], 0) / Math.max(1, split.length)) * 10) / 10;
  const result: Record<string, unknown> = {
    label,
    today,
    iframe,
    iframeFirstDrawMs: firstDrawMs === null ? null : Math.round(firstDrawMs),
    iframeAvgBuildMs: avg('buildMs'),
    iframeAvgPatchMs: avg('patchMs'),
  };
  result['rssTodayMb'] = rssToday;
  result['rssIframeMb'] = await rendererRssMb(app);
  if (frames) {
    result['frames30'] = await bench(window, (b) => b.benchFrames(30, true));
    result['rssWith30FramesMb'] = await rendererRssMb(app);
    await bench(window, (b) => b.removeFrames());
  }
  console.log(`C1-SPEED ${JSON.stringify(result)}`);
  await bench(window, (b) => b.set(false));
};

const openPage = async (window: Page, slug: RegExp): Promise<void> => {
  await window.locator('[data-page-slug]').filter({ hasText: slug }).first().click();
  await window.waitForTimeout(1000);
};

test.describe('iframe C1: speed', () => {
  test.setTimeout(600_000);

  test('a large imported page', async ({ app, window }) => {
    const dir = await copyProject('/home/angie-hemans/Documents/scamp-files/website-import');
    await openProject(app, window, dir);
    for (const slug of [/ruixen/i, /gainwix-an-ai$/i, /resova-health$/i]) {
      await openPage(window, slug);
      await measurePage(app, window, String(slug), false);
    }
  });

  test('glitch views, and 30 frames', async ({ app, window }) => {
    const dir = await copyProject('/home/angie-hemans/Documents/github/glitch/ui/glitch');
    await openProject(app, window, dir);
    await openPage(window, /songs/i);
    await measurePage(app, window, 'glitch songs', true);
  });
});

test.describe('iframe C1: speed, variant set', () => {
  test.setTimeout(300_000);

  // Every frame of the set is an iframe that builds its own CSS on each edit.
  test('the Button starter, 9 frames', async ({ app, window }) => {
    await expect(pageRoot(window)).toBeVisible();
    await openComponentsSection(window);
    await window.getByRole('group', { name: 'Add a starter component' }).getByRole('button', { name: 'Button', exact: true }).click();
    await expect(window.locator('[data-variant-cell]')).toHaveCount(9);
    await measurePage(app, window, 'variant set, 9 frames', false);
  });
});

const SYNTHETIC_COUNT = 1000;

test.describe('iframe C1: speed, synthetic', () => {
  test.setTimeout(300_000);
  const rows = Array.from({ length: SYNTHETIC_COUNT }, (_, i) => i.toString(16).padStart(4, '0'));
  test.use({
    projectOptions: {
      pageContent: {
        home: {
          tsx: `import styles from './home.module.css';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
${rows.map((id) => `      <div data-scamp-id="rect_${id}" className={styles.rect_${id}} />`).join('\n')}
    </div>
  );
}
`,
          css: `.root {
  width: 100%;
  min-height: 100vh;
  position: relative;
}
${rows
  .map(
    (id, i) => `
.rect_${id} {
  width: 40px;
  height: 40px;
  position: absolute;
  left: ${(i % 30) * 46}px;
  top: ${Math.floor(i / 30) * 46}px;
  background: #4466${(i % 200).toString(16).padStart(2, '0')};
  border-radius: 6px;
}`
  )
  .join('\n')}
`,
        },
      },
    },
  });

  test(`${SYNTHETIC_COUNT} rectangles`, async ({ app, window }) => {
    await expect(pageRoot(window)).toBeVisible();
    await measurePage(app, window, `synthetic ${SYNTHETIC_COUNT}`, true);
  });
});
