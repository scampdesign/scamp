import { test, expect } from '../fixtures/app';
import {
  dragInFrame,
  frameToClient,
  measureFrame,
  selectTool,
} from '../fixtures/canvas';
import { clickContextMenuItem } from '../fixtures/components';
import { layersPanel, layersRowByClass } from '../fixtures/layers';
import { canvasElementsByPrefix, pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';

/**
 * Duplicating a named element keeps the name and only regenerates the id
 * suffix, so `menu_a1b2` duplicates to `menu_c3d4`.
 *
 * `cloneElementSubtree.test.ts` covers the clone itself and
 * `parseCode.test.ts` the trip to disk; this covers the wiring — that
 * Cmd+D and the right-click item both reach that clone, and that the
 * tree shows the name on both copies.
 * see docs/archive/2026-08-11-duplicate-preserves-names-plan.md
 */

type Win = Parameters<typeof pageRoot>[0];

/** Draw one rect and return its generated class. */
async function drawRect(window: Win): Promise<string> {
  await expect(pageRoot(window)).toBeVisible();
  await selectTool(window, 'r');
  await dragInFrame(window, { x: 80, y: 80 }, { x: 300, y: 220 });
  await waitForSaved(window);
  const className = await canvasElementsByPrefix(window, 'rect_')
    .first()
    .getAttribute('data-scamp-id');
  if (className === null) throw new Error('rect has no data-scamp-id');
  return className;
}

/**
 * Rename a layer row via its inline editor. Enter blurs the input, which
 * is what commits the name to the store.
 */
async function renameRow(
  window: Win,
  className: string,
  name: string
): Promise<void> {
  await layersRowByClass(window, className).dblclick();
  const input = layersPanel(window).locator('input[type="text"]');
  await expect(input).toBeVisible();
  await input.fill(name);
  await input.press('Enter');
  await waitForSaved(window);
}

/**
 * Right-click at a frame-local point. Coordinate-based rather than a
 * locator click: the canvas chrome overlay sits above the elements and
 * intercepts pointer events.
 */
async function rightClickInFrame(
  window: Win,
  point: { x: number; y: number }
): Promise<void> {
  const metrics = await measureFrame(window);
  const client = frameToClient(metrics, point);
  await window.mouse.click(client.x, client.y, { button: 'right' });
}

/** Every `menu_*` class currently on the canvas. */
const menuClasses = (window: Win): Promise<string[]> =>
  canvasElementsByPrefix(window, 'menu_').evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute('data-scamp-id') ?? '')
  );

test.describe('layers panel: duplicate keeps the name', () => {
  test('Cmd+D gives the copy the same name and a new id suffix', async ({
    window,
  }) => {
    const original = await drawRect(window);
    await renameRow(window, original, 'Menu');
    await expect(layersRowByClass(window, `menu_${original.split('_')[1]}`)).toBeVisible();

    await window.keyboard.press('ControlOrMeta+d');
    await waitForSaved(window);

    const classes = await menuClasses(window);
    expect(classes).toHaveLength(2);
    // Same prefix, different suffix — the whole point of the story.
    expect(classes.every((c) => c.startsWith('menu_'))).toBe(true);
    expect(new Set(classes).size).toBe(2);

    // Both rows read "Menu" in the tree.
    for (const className of classes) {
      await expect(layersRowByClass(window, className)).toContainText('Menu');
    }
  });

  test('the right-click Duplicate item does the same thing', async ({
    window,
  }) => {
    const original = await drawRect(window);
    await renameRow(window, original, 'Menu');

    await rightClickInFrame(window, { x: 190, y: 150 });
    await clickContextMenuItem(window, 'Duplicate');
    await waitForSaved(window);

    const classes = await menuClasses(window);
    expect(classes).toHaveLength(2);
    expect(new Set(classes).size).toBe(2);
  });

  test('duplicating twice gives three distinct menu_ classes', async ({
    window,
  }) => {
    const original = await drawRect(window);
    await renameRow(window, original, 'Menu');

    // Re-select the original each time: Cmd+D selects the new clone, so
    // a second press would otherwise duplicate the duplicate. Either is
    // valid, but duplicating the same element twice is the case the
    // story calls out.
    for (let i = 0; i < 2; i += 1) {
      const first = (await menuClasses(window))[0];
      if (first === undefined) throw new Error('no menu element to duplicate');
      await layersRowByClass(window, first).click();
      await window.keyboard.press('ControlOrMeta+d');
      await waitForSaved(window);
    }

    const classes = await menuClasses(window);
    expect(classes).toHaveLength(3);
    expect(new Set(classes).size).toBe(3);
  });

  test('an unnamed element still duplicates to the default rect_ prefix', async ({
    window,
  }) => {
    // The guard against over-applying the change: nothing invents a name.
    await drawRect(window);
    await window.keyboard.press('ControlOrMeta+d');
    await waitForSaved(window);

    const classes = await canvasElementsByPrefix(window, 'rect_').evaluateAll(
      (nodes) => nodes.map((n) => n.getAttribute('data-scamp-id') ?? '')
    );
    expect(classes).toHaveLength(2);
    expect(new Set(classes).size).toBe(2);
  });
});
