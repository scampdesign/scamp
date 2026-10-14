import { promises as fs } from 'fs';
import type { Page } from '@playwright/test';

import { test, expect } from '../fixtures/app';
import { waitForSaved } from '../fixtures/assertions';
import { openPagesSection } from '../fixtures/components';
import { pageRoot, pageSidebarItem, saveStatus } from '../fixtures/selectors';

/**
 * Edits made while sync is paused reach disk, and the indicator doesn't
 * call them saved before they do. Audit items 7 and 8 in
 * docs/archive/2026-10-12-audit-2026-10-12.md.
 */

test.use({ projectOptions: { extraPages: ['about'] } });

type StoreHandle = {
  __scampCanvasStore?: {
    getState: () => {
      rootElementId: string;
      activePage: { cssPath: string } | null;
      activeComponent: { name: string; cssPath: string } | null;
      patchElement: (id: string, patch: { backgroundColor: string }) => void;
    };
  };
};

const toggleSync = async (window: Page): Promise<void> => {
  await saveStatus(window).click();
  await window.getByTestId('manual-sync-toggle').click();
};

/** Paint the open page's root; returns that page's stylesheet path and name. */
const paintRoot = async (window: Page, color: string): Promise<{ cssPath: string; name: string }> => {
  const open = await window.evaluate((c) => {
    const store = (window as unknown as StoreHandle).__scampCanvasStore?.getState();
    if (!store) return null;
    store.patchElement(store.rootElementId, { backgroundColor: c });
    const target = store.activeComponent ?? store.activePage;
    return target ? { cssPath: target.cssPath, name: store.activeComponent?.name ?? '' } : null;
  }, color);
  if (open === null) throw new Error('No open page to paint');
  return open;
};

const fileHas = (path: string, text: string): Promise<boolean> =>
  fs.readFile(path, 'utf-8').then((css) => css.includes(text));

test('an edit made while paused is written when you resume', async ({ window }) => {
  await expect(pageRoot(window)).toBeVisible();
  await toggleSync(window);
  await expect(saveStatus(window)).toHaveAttribute('data-status', 'paused');

  const { cssPath } = await paintRoot(window, '#123456');
  // Well past the 200ms debounce: still held, still not on disk.
  await window.waitForTimeout(500);
  expect(await fileHas(cssPath, '#123456')).toBe(false);

  await toggleSync(window);
  await waitForSaved(window);
  await expect.poll(() => fileHas(cssPath, '#123456')).toBe(true);
});

test('an edit made while paused is written when you switch page', async ({ window }) => {
  await expect(pageRoot(window)).toBeVisible();
  await toggleSync(window);
  const { cssPath, name } = await paintRoot(window, '#654321');
  await window.waitForTimeout(500);
  expect(await fileHas(cssPath, '#654321')).toBe(false);

  await openPagesSection(window);
  await pageSidebarItem(window, name === 'About' ? 'home' : 'about').click();
  await expect.poll(() => fileHas(cssPath, '#654321')).toBe(true);
});
