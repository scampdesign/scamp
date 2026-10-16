import { promises as fs } from 'fs';
import * as path from 'path';
import type { Page } from '@playwright/test';

import { test, expect } from '../fixtures/app';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';
import { pageRoot } from '../fixtures/selectors';

/**
 * Images dropped onto the canvas: a file, a URL from a browser, or a
 * browser's markup. Playwright can't drag from the OS file manager, so
 * most drops are built in the page and dispatched on the canvas layer.
 * One goes through Chromium's own drag pipeline (CDP
 * `Input.dispatchDragEvent`) with a real file on disk, which is what
 * exercises `pathForFile`.
 * see docs/plans/image-drop-plan.md
 */

test.use({ projectOptions: { format: 'legacy' } });

// A 1 × 1 red PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

type DropPayload =
  | { kind: 'file'; name: string; type: string; base64?: string; text?: string }
  | { kind: 'data'; uriList?: string; html?: string };

/** Dispatch dragover + drop at the middle of the canvas frame. */
const drop = async (window: Page, payload: DropPayload): Promise<void> => {
  await window.evaluate((p) => {
    const layer = document.querySelector('[data-canvas-chrome="true"]');
    const frame = document.querySelector('[data-testid="canvas-frame"]');
    if (!(layer instanceof HTMLElement) || !(frame instanceof HTMLElement)) throw new Error('no canvas');
    const rect = frame.getBoundingClientRect();
    const dt = new DataTransfer();
    if (p.kind === 'file') {
      const body =
        p.base64 !== undefined ? Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0)) : (p.text ?? '');
      dt.items.add(new File([body], p.name, { type: p.type }));
    } else {
      if (p.uriList !== undefined) dt.setData('text/uri-list', p.uriList);
      if (p.html !== undefined) dt.setData('text/html', p.html);
    }
    const init = { dataTransfer: dt, clientX: rect.left + 200, clientY: rect.top + 200, bubbles: true, cancelable: true };
    layer.dispatchEvent(new DragEvent('dragover', init));
    layer.dispatchEvent(new DragEvent('drop', init));
  }, payload);
};

const assetNames = async (dir: string): Promise<string[]> =>
  fs.readdir(path.join(dir, 'assets')).catch(() => []);

test('a dropped PNG file lands in assets and on the page', async ({ window, project }) => {
  await expect(pageRoot(window)).toBeVisible();
  await drop(window, { kind: 'file', name: 'dot.png', type: 'image/png', base64: PNG_BASE64 });
  await expect(window.locator('[data-testid="canvas-frame"] img')).toHaveCount(1);
  await waitForSaved(window);
  const { tsx } = await readPageFiles(project.dir, project.pageName);
  expect(tsx).toMatch(/<img[^>]*src=/);
  expect((await assetNames(project.dir)).some((name) => name.startsWith('dot'))).toBe(true);
});

test('an image URL dragged from a browser is placed', async ({ window }) => {
  await expect(pageRoot(window)).toBeVisible();
  await drop(window, { kind: 'data', uriList: `# from a browser\n${PNG_DATA_URL}` });
  await expect(window.locator('[data-testid="canvas-frame"] img')).toHaveCount(1);
});

test('a browser drag with only markup places the img it holds', async ({ window }) => {
  await expect(pageRoot(window)).toBeVisible();
  await drop(window, { kind: 'data', html: `<meta charset="utf-8"><img alt="red" src="${PNG_DATA_URL}">` });
  await expect(window.locator('[data-testid="canvas-frame"] img')).toHaveCount(1);
});

test('a file that isn’t an image is refused with a reason', async ({ window }) => {
  await expect(pageRoot(window)).toBeVisible();
  await drop(window, { kind: 'file', name: 'notes.txt', type: 'text/plain', text: 'hello' });
  await expect(window.getByTestId('canvas-notice')).toContainText("notes.txt isn't an image");
  await expect(window.locator('[data-testid="canvas-frame"] img')).toHaveCount(0);
});

test('a small SVG file is still inlined as an editable svg', async ({ window }) => {
  await expect(pageRoot(window)).toBeVisible();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ff0000"/></svg>';
  await drop(window, { kind: 'file', name: 'dot.svg', type: 'image/svg+xml', text: svg });
  await expect(window.locator('[data-testid="canvas-frame"] svg circle')).toHaveCount(1);
  await expect(window.locator('[data-testid="canvas-frame"] img')).toHaveCount(0);
});

test('the canvas accepts a file drag from its first dragenter, and the rest of the window refuses it', async ({ window }) => {
  await expect(pageRoot(window)).toBeVisible();
  const accepted = await window.evaluate(() => {
    const layer = document.querySelector('[data-canvas-chrome="true"]');
    if (!(layer instanceof HTMLElement)) throw new Error('no canvas');
    const rect = layer.getBoundingClientRect();
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'dot.png', { type: 'image/png' }));
    const at = { dataTransfer: dt, clientX: rect.left + 10, clientY: rect.top + 10, bubbles: true, cancelable: true };
    const enter = new DragEvent('dragenter', at);
    layer.dispatchEvent(enter);
    // Outside the canvas: the window guard claims it so it can't navigate,
    // and marks it as no drop.
    const stray = new DragEvent('dragover', { ...at, clientX: 1, clientY: 1 });
    document.body.dispatchEvent(stray);
    return { enter: enter.defaultPrevented, stray: stray.defaultPrevented };
  });
  expect(accepted.enter).toBe(true);
  expect(accepted.stray).toBe(true);
});

test('a PNG on disk, dragged in through Chromium, is copied into assets by its path', async ({ window, project }) => {
  await expect(pageRoot(window)).toBeVisible();
  const file = path.join(project.dir, '..', 'from-disk.png');
  await fs.writeFile(file, Buffer.from(PNG_BASE64, 'base64'));
  const box = await window.locator('[data-testid="canvas-frame"]').boundingBox();
  if (box === null) throw new Error('no canvas');
  const at = { x: box.x + 200, y: box.y + 200 };
  const data = { items: [], files: [file], dragOperationsMask: 1 };
  const cdp = await window.context().newCDPSession(window);
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', ...at, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', ...at, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'drop', ...at, data });
  await expect(window.locator('[data-testid="canvas-frame"] img')).toHaveCount(1);
  await waitForSaved(window);
  expect((await assetNames(project.dir)).some((name) => name.startsWith('from-disk'))).toBe(true);
});
