import { execFileSync } from 'node:child_process';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, stubOpenDialog } from './app';
import { copyFixtureApp } from './reactApp';

/**
 * Embedded Scamp in e2e: the fixture app as a git repo, the window opened
 * from the app, and the running page reached through its webview.
 * see docs/plans/embedded-scamp-plan.md
 */

/** `test/fixtures/embedded-app`, copied, with one commit on `main`. The caller removes it. */
export const copyEmbeddedApp = async (): Promise<string> => {
  const dir = await copyFixtureApp('embedded-app');
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  };
  git('init', '-b', 'main');
  git('config', 'user.name', 'E2E');
  git('config', 'user.email', 'e2e@scamp.test');
  git('add', '-A');
  git('commit', '-m', 'start');
  return dir;
};

export const gitIn = (dir: string, ...args: string[]): string => execFileSync('git', args, { cwd: dir, encoding: 'utf-8' }).trim();

/** Open the Embedded Scamp window from the app window, pointed at `dir`. */
export const openEmbedded = async (app: ElectronApplication, window: Page, dir: string): Promise<Page> => {
  const opened = app.waitForEvent('window');
  await window.evaluate(() => (globalThis as unknown as { scamp: { openEmbedded: () => Promise<void> } }).scamp.openEmbedded());
  const embedded = await opened;
  await embedded.waitForLoadState('domcontentloaded');
  await stubOpenDialog(app, dir);
  await embedded.getByTestId('embedded-choose').click();
  return embedded;
};

/** Start the project and wait for the inspector in its page. */
export const startEmbedded = async (embedded: Page): Promise<void> => {
  await embedded.getByTestId('embedded-start').click();
  await expect(embedded.getByTestId('embedded-webview')).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => inPage(embedded, 'window.__scampInspector !== undefined'), { timeout: 60_000 }).toBe(true);
};

/** Run code in the project's page and return its result. */
export const inPage = <T = unknown>(embedded: Page, code: string): Promise<T> =>
  embedded.evaluate(
    (source) =>
      (document.querySelector('webview') as unknown as { executeJavaScript: (c: string) => Promise<unknown> }).executeJavaScript(source),
    code
  ) as Promise<T>;

const pointInPage = async (embedded: Page, selector: string, at: 'center' | 'corner'): Promise<{ x: number; y: number }> => {
  const point = await inPage<{ x: number; y: number } | null>(
    embedded,
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return ${
      at === 'center' ? '{ x: r.left + r.width / 2, y: r.top + r.height / 2 }' : '{ x: r.left + 3, y: r.top + 3 }'
    }; })()`
  );
  if (point === null) throw new Error(`nothing in the page matches ${selector}`);
  const box = await embedded.getByTestId('embedded-webview').boundingBox();
  if (box === null) throw new Error('the webview is not on screen');
  return { x: box.x + point.x, y: box.y + point.y };
};

/**
 * A real click on an element of the page, through the webview: at its
 * centre, or just inside its top-left corner to hit it rather than a child.
 */
export const clickInPage = async (embedded: Page, selector: string, at: 'center' | 'corner' = 'center'): Promise<void> => {
  const { x, y } = await pointInPage(embedded, selector, at);
  await embedded.mouse.click(x, y);
};

/** Move the pointer onto an element of the page, so CSS `:hover` applies. */
export const hoverInPage = async (embedded: Page, selector: string, at: 'center' | 'corner' = 'center'): Promise<void> => {
  const { x, y } = await pointInPage(embedded, selector, at);
  await embedded.mouse.move(x, y);
};
