import { test, expect } from '../fixtures/app';
import {
  dragInFrame,
  frameToClient,
  measureFrame,
  selectTool,
} from '../fixtures/canvas';
import { clickContextMenuItem } from '../fixtures/components';
import { drawAndSelectRect } from '../fixtures/panel';
import { canvasElementsByPrefix, pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';

/**
 * Copy / cut / paste, end to end. `clipboardActions.test.ts` covers what
 * the store actions do; this covers the wiring — that the shortcuts and
 * the menu items reach them, and that the clipboard outlives a page
 * switch (which is the feature's main use case).
 * see docs/plans/copy-cut-paste-plan.md
 */

type Win = Parameters<typeof pageRoot>[0];

const rects = (window: Win): ReturnType<typeof canvasElementsByPrefix> =>
  canvasElementsByPrefix(window, 'rect_');

/** Right-click at a frame-local point. Coordinate-based because the
 *  canvas chrome overlay intercepts locator clicks. */
async function rightClickInFrame(
  window: Win,
  point: { x: number; y: number }
): Promise<void> {
  const metrics = await measureFrame(window);
  const client = frameToClient(metrics, point);
  await window.mouse.click(client.x, client.y, { button: 'right' });
}

/**
 * Click empty canvas so the page root becomes the selection.
 *
 * Matters for the positioning tests: paste targets the selected
 * container, so pasting while the copied rect is still selected nests
 * the copy INSIDE it — correct, but it puts the two in different
 * coordinate spaces and makes their positions incomparable.
 */
async function selectPageRoot(window: Win): Promise<void> {
  await selectTool(window, 'v');
  await dragInFrame(window, { x: 700, y: 550 }, { x: 700, y: 550 });
}

/**
 * Add a page and switch to it, returning once the switch has happened.
 *
 * Waits for the name field to go: until it does, focus is still in it,
 * and a `ControlOrMeta+V` typed straight after went into the input
 * instead of the canvas. Both tests that paste onto a new page failed
 * that way, intermittently and on different lines each run.
 */
async function addPage(window: Win, name: string): Promise<void> {
  await window.getByRole('button', { name: /\+ Add Page/ }).click();
  const nameInput = window.getByPlaceholder('page-name');
  await nameInput.fill(name);
  await nameInput.press('Enter');
  await expect(nameInput).toBeHidden();
  // Wait for the store to say the NEW page is the open one.
  //
  // Two weaker gates were tried and both have holes. `rects === 0` is
  // also true in the gap where the old page has gone and the new one
  // has not arrived. And `pageRoot` is
  // `[data-element-id="root"][data-scamp-id="root"]` — the SAME on
  // every page — so waiting for it matches the old page's root
  // immediately and proves nothing at all.
  //
  // The store is the only thing that actually knows. `activePage` in a
  // Next.js or legacy project, `activeComponent` in a scamp one, where
  // every page is a view.
  await expect
    .poll(
      async () =>
        window.evaluate((wanted) => {
          const w = window as unknown as {
            __scampCanvasStore?: {
              getState: () => {
                activePage?: { name?: string } | null;
                activeComponent?: { name?: string } | null;
              };
            };
          };
          const state = w.__scampCanvasStore?.getState();
          const open = state?.activePage?.name ?? state?.activeComponent?.name ?? '';
          return open.toLowerCase().replace(/[^a-z0-9]/g, '') === wanted;
        }, name.toLowerCase().replace(/[^a-z0-9]/g, '')),
      { timeout: 15_000 }
    )
    .toBe(true);
  await waitForSaved(window);
}

test.describe('clipboard: copy, cut, paste', () => {
  test('the clipboard survives a page switch', async ({ window }) => {
    // The headline use case: build something on one page, reuse it on
    // another.
    await expect(pageRoot(window)).toBeVisible();
    await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 220, y: 200 });
    await waitForSaved(window);
    await window.keyboard.press('ControlOrMeta+c');

    await addPage(window, 'about');
    await expect(rects(window)).toHaveCount(0);
    // Put the canvas back in the state a user would paste from: the
    // select tool, and the new page's root selected.
    await selectPageRoot(window);

    await window.keyboard.press('ControlOrMeta+v');
    await waitForSaved(window);
    await expect(rects(window)).toHaveCount(1);
  });

  test('Cmd+X removes the element, and Cmd+V brings it back', async ({
    window,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 220, y: 200 });
    await waitForSaved(window);

    await window.keyboard.press('ControlOrMeta+x');
    await waitForSaved(window);
    await expect(rects(window)).toHaveCount(0);

    await window.keyboard.press('ControlOrMeta+v');
    await waitForSaved(window);
    await expect(rects(window)).toHaveCount(1);
  });

  test('a cut is a single undo step', async ({ window }) => {
    await expect(pageRoot(window)).toBeVisible();
    await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 220, y: 200 });
    await waitForSaved(window);

    await window.keyboard.press('ControlOrMeta+x');
    await waitForSaved(window);
    await expect(rects(window)).toHaveCount(0);

    // One press, not two — cut commits copy+delete together.
    await window.keyboard.press('ControlOrMeta+z');
    await expect(rects(window)).toHaveCount(1);
  });

  test('the right-click menu copies and pastes at the clicked point', async ({
    window,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await drawAndSelectRect(window, { x: 60, y: 60 }, { x: 180, y: 160 });
    await waitForSaved(window);

    await rightClickInFrame(window, { x: 120, y: 110 });
    await clickContextMenuItem(window, 'Copy', true);

    // Right-click well away from the original, on empty canvas.
    await rightClickInFrame(window, { x: 500, y: 400 });
    await clickContextMenuItem(window, 'Paste', true);
    await waitForSaved(window);

    await expect(rects(window)).toHaveCount(2);
    // The paste landed near where it was asked to, not on the original.
    const boxes = await rects(window).evaluateAll((nodes) =>
      nodes.map((n) => n.getBoundingClientRect().left)
    );
    expect(new Set(boxes).size).toBe(2);
  });

  test('Cmd+Shift+V pastes in place, on top of the original', async ({
    window,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 220, y: 200 });
    await waitForSaved(window);

    await window.keyboard.press('ControlOrMeta+c');
    await selectPageRoot(window);
    await window.keyboard.press('ControlOrMeta+Shift+v');
    await waitForSaved(window);

    await expect(rects(window)).toHaveCount(2);
    const lefts = await rects(window).evaluateAll((nodes) =>
      nodes.map((n) => Math.round(n.getBoundingClientRect().left))
    );
    // In place means exactly co-located — an ordinary paste offsets.
    expect(lefts[0]).toBe(lefts[1]);
  });

  test('an ordinary paste offsets so the copy is visible', async ({
    window,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 220, y: 200 });
    await waitForSaved(window);

    await window.keyboard.press('ControlOrMeta+c');
    await selectPageRoot(window);
    await window.keyboard.press('ControlOrMeta+v');
    await waitForSaved(window);

    const lefts = await rects(window).evaluateAll((nodes) =>
      nodes.map((n) => Math.round(n.getBoundingClientRect().left))
    );
    expect(lefts[0]).not.toBe(lefts[1]);
  });

  test('copying the page root takes everything on it', async ({ window }) => {
    await expect(pageRoot(window)).toBeVisible();
    await drawAndSelectRect(window, { x: 60, y: 60 }, { x: 160, y: 160 });
    await waitForSaved(window);
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 260, y: 60 }, { x: 360, y: 160 });
    await waitForSaved(window);
    await expect(rects(window)).toHaveCount(2);

    // Right-click empty canvas hits the root.
    await rightClickInFrame(window, { x: 600, y: 500 });
    await clickContextMenuItem(window, 'Copy', true);

    await addPage(window, 'about');
    await expect(rects(window)).toHaveCount(0);
    await selectPageRoot(window);
    await window.keyboard.press('ControlOrMeta+v');
    await waitForSaved(window);

    // Both rects came across, not the page frame.
    await expect(rects(window)).toHaveCount(2);
  });
});
