import type { Locator, Page } from '@playwright/test';

import { test, expect } from '../fixtures/app';
import { pageRoot } from '../fixtures/selectors';

/**
 * The code panel and the terminal share one height, set by dragging their
 * top edge. see docs/plans/resizable-sidebar-plan.md
 */

const panels = (window: Page): Locator => window.getByTestId('bottom-panels');
const edge = (window: Page): Locator => window.getByRole('separator', { name: 'Resize the bottom panel' });
const heightOf = async (locator: Locator): Promise<number> => (await locator.boundingBox())?.height ?? 0;

test.describe('project view: resizable bottom panel', () => {
  test('dragging the top edge makes it taller, the terminal keeps that height, and double-click resets it', async ({
    window,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await window.locator('[data-action="toggle-code"]').click();
    await expect.poll(() => heightOf(panels(window))).toBe(280);

    const box = await edge(window).boundingBox();
    if (box === null) throw new Error('no bottom panel edge');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await window.mouse.move(x, y);
    await window.mouse.down();
    await window.mouse.move(x, y - 100, { steps: 8 });
    await window.mouse.up();
    expect(await heightOf(panels(window))).toBe(380);

    await window.keyboard.press('Control+`');
    await expect(window.getByTestId('terminal-panel')).toBeVisible();
    expect(await heightOf(panels(window))).toBe(380);

    await edge(window).dblclick();
    await expect.poll(() => heightOf(panels(window))).toBe(280);
  });

  test('a closed panel takes no room', async ({ window }) => {
    await expect(pageRoot(window)).toBeVisible();
    expect(await heightOf(panels(window))).toBe(0);
    await expect(edge(window)).toHaveCount(0);
  });
});
