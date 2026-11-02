import type { Page } from '@playwright/test';

import { test, expect } from '../fixtures/app';
import { IFRAME_CANVAS, canvasElement, pageRoot } from '../fixtures/selectors';

/**
 * A scroll container in the page (`overflow: auto`) scrolls under the wheel
 * on the canvas, as in the browser, and the canvas pans once it can't.
 * see docs/notes/iframe-canvas.md
 */

const TSX = [
  "import styles from './home.module.css';",
  '',
  'export default function Home() {',
  '  return (',
  '    <div data-scamp-id="root" className={styles.root}>',
  '      <div data-scamp-id="a003" className={styles.spacer_a003} />',
  '      <div data-scamp-id="a001" className={styles.list_a001}>',
  '        <div data-scamp-id="a002" className={styles.item_a002} />',
  '      </div>',
  '    </div>',
  '  );',
  '}',
  '',
].join('\n');

const CSS = [
  '.root {',
  '  width: 100%;',
  '  min-height: 100vh;',
  '  position: relative;',
  '}',
  '',
  '.spacer_a003 {',
  '  position: absolute;',
  '  left: 0px;',
  '  top: 0px;',
  '  width: 10px;',
  '  height: 3000px;',
  '}',
  '',
  '.list_a001 {',
  '  position: absolute;',
  '  left: 200px;',
  '  top: 40px;',
  '  width: 300px;',
  '  height: 200px;',
  '  overflow-y: auto;',
  '  background: #eeeeee;',
  '}',
  '',
  '.item_a002 {',
  '  width: 100%;',
  '  height: 800px;',
  '  background: #c33;',
  '}',
  '',
].join('\n');

test.use({ projectOptions: { format: 'nextjs', pageContent: { home: { tsx: TSX, css: CSS } } } });

/** How far the canvas itself has scrolled: the frame's nearest scrolling ancestor. */
const canvasScrollTop = (window: Page): Promise<number> =>
  window.evaluate(() => {
    let el = document.querySelector('[data-testid="canvas-frame"]')?.parentElement ?? null;
    while (el !== null && !['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) el = el.parentElement;
    return el?.scrollTop ?? -1;
  });

const boxScrollTop = (window: Page): Promise<number> =>
  canvasElement(window, 'list_a001').evaluate((el) => el.scrollTop);

const wheelOverBox = async (window: Page, dy: number): Promise<void> => {
  const box = await canvasElement(window, 'list_a001').boundingBox();
  if (box === null) throw new Error('scroll box not on screen');
  await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await window.mouse.wheel(0, dy);
};

test.describe('canvas: scroll containers', () => {
  test('the wheel scrolls a scroll container, not the canvas', async ({ window }) => {
    await expect(pageRoot(window)).toBeVisible();
    await expect(canvasElement(window, 'list_a001')).toBeVisible();
    const before = await canvasScrollTop(window);
    await wheelOverBox(window, 120);
    await expect.poll(() => boxScrollTop(window)).toBeGreaterThan(0);
    expect(await canvasScrollTop(window)).toBe(before);
  });

  test('once the container is at its end, the canvas scrolls', async ({ window }) => {
    await expect(canvasElement(window, 'list_a001')).toBeVisible();
    await canvasElement(window, 'list_a001').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const atEnd = await boxScrollTop(window);
    const before = await canvasScrollTop(window);
    await wheelOverBox(window, 120);
    await expect.poll(() => canvasScrollTop(window)).toBeGreaterThan(before);
    expect(await boxScrollTop(window)).toBe(atEnd);
  });

  test('the selection outline follows an element the container scrolls', async ({ window }) => {
    test.skip(!IFRAME_CANVAS, 'the legacy canvas never let a container scroll');
    const item = canvasElement(window, 'item_a002');
    const start = await item.boundingBox();
    if (start === null) throw new Error('item not on screen');
    await window.mouse.click(start.x + start.width / 2, start.y + 20);
    const overlay = window.getByTestId('selection-overlay');
    await expect(overlay).toBeVisible();
    await wheelOverBox(window, 120);
    await expect.poll(() => boxScrollTop(window)).toBeGreaterThan(0);
    await expect
      .poll(async () => {
        const [o, i] = await Promise.all([overlay.boundingBox(), item.boundingBox()]);
        return o !== null && i !== null ? Math.round(Math.abs(o.y - i.y)) : -1;
      })
      .toBeLessThanOrEqual(1);
  });
});
