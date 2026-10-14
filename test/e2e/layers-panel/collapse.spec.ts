import { test, expect } from '../fixtures/app';
import { dragInFrame, selectTool } from '../fixtures/canvas';
import {
  collapseToggle,
  hiddenSelectionDot,
  layersPanel,
  layersRowByClass,
} from '../fixtures/layers';
import { canvasElementsByPrefix, pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';

/**
 * Collapsing branches in the layers tree.
 *
 * `treeRows.test.ts` covers which rows a given collapse state produces; this
 * covers the wiring — that the triangle reaches the store, that the state
 * outlives an unmount, and that selection and collapse don't fight.
 * see docs/archive/2026-08-11-tree-collapse-plan.md
 */

type Win = Parameters<typeof pageRoot>[0];

/**
 * Draw `count` rects, each inside the last; returns their classes, outermost
 * first.
 *
 * Overloaded so call sites get a real tuple — two levels covers most cases,
 * but Alt+click needs three so the MIDDLE row has a triangle of its own to
 * inspect.
 */
async function nestedRects(window: Win): Promise<[string, string]>;
async function nestedRects(window: Win, count: 3): Promise<[string, string, string]>;
async function nestedRects(window: Win, count: 2 | 3 = 2): Promise<string[]> {
  await expect(pageRoot(window)).toBeVisible();
  const boxes = [
    { from: { x: 80, y: 80 }, to: { x: 420, y: 340 } },
    { from: { x: 110, y: 110 }, to: { x: 380, y: 300 } },
    { from: { x: 140, y: 140 }, to: { x: 340, y: 260 } },
  ].slice(0, count);

  for (const box of boxes) {
    await selectTool(window, 'r');
    await dragInFrame(window, box.from, box.to);
    await waitForSaved(window);
  }

  const classes = await canvasElementsByPrefix(window, 'rect_').evaluateAll(
    (nodes) => nodes.map((n) => n.getAttribute('data-scamp-id') ?? '')
  );
  if (classes.length < count || classes.some((c) => c === '')) {
    throw new Error(`expected ${count} nested rects, got ${classes.join()}`);
  }
  return classes;
}

test.describe('layers panel: collapse', () => {
  test('the triangle hides descendants and restores them', async ({ window }) => {
    const [outer, inner] = await nestedRects(window);

    await expect(layersRowByClass(window, inner)).toBeVisible();
    await collapseToggle(window, outer).click();
    await expect(layersRowByClass(window, inner)).toHaveCount(0);
    // The collapsed element itself stays — only its contents hide.
    await expect(layersRowByClass(window, outer)).toBeVisible();

    await collapseToggle(window, outer).click();
    await expect(layersRowByClass(window, inner)).toBeVisible();
  });

  test('leaf rows have no triangle, and neither does the page root', async ({
    window,
  }) => {
    const [, inner] = await nestedRects(window);
    await expect(collapseToggle(window, inner)).toHaveCount(0);
    // Collapsing the root would hide the whole tree.
    await expect(collapseToggle(window, 'root')).toHaveCount(0);
  });

  test('collapse survives the tree being unmounted and remounted', async ({
    window,
  }) => {
    // The Design System panel replaces the layers tree entirely, so this is
    // the regression for keeping collapse state in the store rather than in
    // component state.
    const [outer, inner] = await nestedRects(window);
    await collapseToggle(window, outer).click();
    await expect(layersRowByClass(window, inner)).toHaveCount(0);

    // Move off the toggle first: its tooltip lingers over the sidebar rail
    // and can swallow the next click, which then reads as a product failure.
    await window.mouse.move(0, 0);

    // Assert the whole panel is gone, not one row — that IS the unmount.
    await window.locator('[data-section="design-system"]').click();
    await expect(window.getByTestId('theme-panel')).toBeVisible();
    await expect(layersPanel(window)).toHaveCount(0);

    await window.locator('[data-section="design-system"]').click();
    await expect(layersPanel(window)).toHaveCount(1);

    await expect(layersRowByClass(window, outer)).toBeVisible();
    await expect(layersRowByClass(window, inner)).toHaveCount(0);
  });

  test('selecting a hidden element expands its ancestors', async ({ window }) => {
    const [outer, inner] = await nestedRects(window);
    // Select the outer one so the inner isn't already the selection.
    await layersRowByClass(window, outer).click();
    await collapseToggle(window, outer).click();
    await expect(layersRowByClass(window, inner)).toHaveCount(0);

    // Click the inner rect on the canvas — the tree should reveal it.
    await selectTool(window, 'v');
    await dragInFrame(window, { x: 200, y: 190 }, { x: 200, y: 190 });
    await expect(layersRowByClass(window, inner)).toBeVisible();
  });

  test('collapsing over the selection sticks, and marks the row', async ({
    window,
  }) => {
    // The regression for the auto-expand rule: it fires when the SELECTION
    // changes, not continuously. If it ran on every render, this collapse
    // would spring straight back open and the branch could never be folded.
    const [outer, inner] = await nestedRects(window);
    await layersRowByClass(window, inner).click();
    await collapseToggle(window, outer).click();

    await expect(layersRowByClass(window, inner)).toHaveCount(0);
    await expect(hiddenSelectionDot(window, outer)).toBeVisible();
  });

  test('Alt+click folds the whole subtree at once', async ({ window }) => {
    // Three levels, so the MIDDLE one has a triangle whose state proves the
    // fold went deeper than the row that was clicked.
    const [outer, middle] = await nestedRects(window, 3);

    await collapseToggle(window, outer).click({ modifiers: ['Alt'] });
    await expect(layersRowByClass(window, middle)).toHaveCount(0);

    // Re-open just the outer row: the middle must still be collapsed, which
    // a plain (non-recursive) toggle would not have done.
    await collapseToggle(window, outer).click();
    await expect(collapseToggle(window, middle)).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });
});
