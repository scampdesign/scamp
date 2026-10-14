import { promises as fs } from 'fs';
import path from 'path';

import { test, expect } from '../fixtures/app';
import { waitForSaved } from '../fixtures/assertions';
import { drawAndSelectRect } from '../fixtures/panel';
import { pageRoot, saveStatus } from '../fixtures/selectors';

/**
 * A save that fails doesn't cost the edit: the next save writes it too.
 * The write cache used to keep the failed content, so the next save was
 * refused and its merge undid the failed edit.
 * Audit item 9 in docs/archive/2026-10-12-audit-2026-10-12.md.
 */

type StoreHandle = {
  __scampCanvasStore?: {
    getState: () => {
      rootElementId: string;
      activePage: { cssPath: string } | null;
      activeComponent: { cssPath: string } | null;
      patchElement: (id: string, patch: { backgroundColor: string }) => void;
    };
  };
};

test('an edit whose save failed is written by the next save', async ({ window }) => {
  await expect(pageRoot(window)).toBeVisible();
  const cssPath = await window.evaluate(() => {
    const store = (window as unknown as StoreHandle).__scampCanvasStore?.getState();
    return (store?.activeComponent ?? store?.activePage)?.cssPath ?? null;
  });
  if (cssPath === null) throw new Error('No open page');
  const dir = path.dirname(cssPath);

  // A read-only folder: the write's temp file can't be created.
  await fs.chmod(dir, 0o555);
  try {
    await window.evaluate(() => {
      const store = (window as unknown as StoreHandle).__scampCanvasStore?.getState();
      store?.patchElement(store.rootElementId, { backgroundColor: '#111111' });
    });
    await expect(saveStatus(window)).toHaveAttribute('data-status', 'error');
  } finally {
    await fs.chmod(dir, 0o755);
  }

  await drawAndSelectRect(window, { x: 80, y: 80 }, { x: 180, y: 160 });
  await waitForSaved(window);
  const css = await fs.readFile(cssPath, 'utf-8');
  expect(css).toContain('#111111');
  expect(css).toMatch(/\.rect_/);
});
