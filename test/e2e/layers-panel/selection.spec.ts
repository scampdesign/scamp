import { test, expect } from '../fixtures/app';
import { dragInFrame, selectTool } from '../fixtures/canvas';
import { layersRowByClass, layersRows } from '../fixtures/layers';
import {
  canvasElementsByPrefix,
  pageRoot,
  resizeHandle,
} from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';

test.describe('layers panel: selection', () => {
  test('clicking a row selects the canvas element (resize handles appear)', async ({
    window,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 100, y: 100 }, { x: 220, y: 200 });
    await waitForSaved(window);
    const cls = await canvasElementsByPrefix(window, 'rect_')
      .first()
      .getAttribute('data-scamp-id');
    if (!cls) throw new Error('no rect created');

    // Deselect first.
    await layersRowByClass(window, 'root').click();
    // Clicking the Page row selects the root — no resize handles (root
    // hides them via SelectionOverlay.showHandles=false).
    await expect(resizeHandle(window, 'se')).toHaveCount(0);

    // Click the rect row → selected → resize handles appear on canvas.
    await layersRowByClass(window, cls).click();
    await expect(resizeHandle(window, 'se')).toBeVisible();
  });

  test('Shift-click selects the run of rows, and Cmd-click takes one out', async ({ window }) => {
    await expect(pageRoot(window)).toBeVisible();
    for (const x of [60, 200, 340]) {
      await selectTool(window, 'r');
      await dragInFrame(window, { x, y: 80 }, { x: x + 100, y: 160 });
    }
    await waitForSaved(window);
    const rects = canvasElementsByPrefix(window, 'rect_');
    const [first, second, third] = await Promise.all(
      [0, 1, 2].map((i) => rects.nth(i).getAttribute('data-scamp-id'))
    );
    if (!first || !second || !third) throw new Error('did not create three rects');

    await layersRowByClass(window, first).click();
    await layersRowByClass(window, third).click({ modifiers: ['Shift'] });
    await expect(window.getByTestId('multi-select-note')).toContainText('3 elements selected');

    await layersRowByClass(window, second).click({ modifiers: ['ControlOrMeta'] });
    await expect(window.getByTestId('multi-select-note')).toContainText('2 elements selected');
  });

  test('layer rows appear in DFS order (Page first, then children)', async ({
    window,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 80, y: 80 }, { x: 180, y: 160 });
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 220, y: 80 }, { x: 320, y: 160 });
    await waitForSaved(window);

    const rows = layersRows(window);
    await expect(rows).toHaveCount(3); // Page + 2 rects
    await expect(rows.nth(0)).toHaveAttribute('data-element-class', 'root');
  });
});
