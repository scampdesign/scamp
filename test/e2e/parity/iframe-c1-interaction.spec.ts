import { test, expect } from '../fixtures/app';
import { drawAndSelectRect } from '../fixtures/panel';
import { pageRoot } from '../fixtures/selectors';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';

/**
 * Experiment (option C1): selection drawn from the parent document, click
 * to select through the iframe, and a drag that moves the drawn node first
 * and commits the file on release. see docs/plans/canvas-rendering-options.md
 */

test('the iframe canvas selects by click and moves an element by drag', async ({ window, project }) => {
  await expect(pageRoot(window)).toBeVisible();
  const cls = await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 220, y: 180 });
  await waitForSaved(window);
  const leftOf = async (): Promise<number> => {
    const { css } = await readPageFiles(project.dir, project.pageName);
    const block = new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`).exec(css)?.[0] ?? '';
    return Number(/left:\s*(-?\d+)px/.exec(block)?.[1] ?? NaN);
  };
  const leftBefore = await leftOf();

  await window.evaluate(() =>
    (globalThis as unknown as { __scampIframeCanvas: { set: (on: boolean) => void } }).__scampIframeCanvas.set(true)
  );
  const iframe = window.locator('[data-testid="iframe-canvas"] iframe');
  await expect(iframe).toBeVisible();
  const frame = await (await iframe.elementHandle())?.contentFrame();
  if (!frame) throw new Error('no iframe canvas');
  await expect.poll(() => frame.evaluate((c) => document.querySelector(`.${c}`) !== null, cls)).toBe(true);

  // Click empty page: the root is selected, not the rect.
  const layer = window.locator('[data-testid="iframe-canvas"] > div').last();
  const box = await layer.boundingBox();
  if (!box) throw new Error('no layer');
  await window.mouse.click(box.x + box.width - 20, box.y + box.height - 20);

  // The rect's on-screen position: its iframe rect, scaled like the frame.
  const target = await frame.evaluate((c) => {
    const r = document.querySelector(`.${c}`)?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, cls);
  if (!target) throw new Error('rect not drawn');
  const scale = box.width / (await layer.evaluate((el) => (el as HTMLElement).offsetWidth));
  const x = box.x + target.x * scale;
  const y = box.y + target.y * scale;

  await window.mouse.move(x, y);
  await window.mouse.down();
  await expect(window.locator('[data-testid="iframe-canvas"] [class*="outline"]')).toHaveCount(1);
  await window.mouse.move(x + 50 * scale, y, { steps: 6 });
  await window.mouse.up();
  await waitForSaved(window);

  await expect.poll(leftOf).toBe(leftBefore + 50);

  // A structural change reaches the iframe: the patch walks into the root.
  await window.keyboard.press('Delete');
  await expect.poll(() => frame.evaluate((c) => document.querySelector(`.${c}`) !== null, cls)).toBe(false);
  await expect.poll(() => frame.evaluate(() => document.querySelector('.root') !== null)).toBe(true);
});
