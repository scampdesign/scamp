import { test, expect } from '../fixtures/app';
import { dragInFrame, selectTool } from '../fixtures/canvas';
import { layersRowByClass } from '../fixtures/layers';
import { canvasElementsByPrefix, pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';

test.describe('grouping: nested groups', () => {
  test('grouping an existing group produces a group-of-group', async ({
    window,
  }) => {
    await expect(pageRoot(window)).toBeVisible();

    // Two rects — group them into G1.
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 80, y: 80 }, { x: 180, y: 180 });
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 220, y: 80 }, { x: 320, y: 180 });
    const firstClass = await canvasElementsByPrefix(window, 'rect_').first().getAttribute('data-scamp-id');
    const secondClass = await canvasElementsByPrefix(window, 'rect_').nth(1).getAttribute('data-scamp-id');
    if (!firstClass || !secondClass) throw new Error('failed to create rects');

    await layersRowByClass(window, firstClass).click();
    await layersRowByClass(window, secondClass).click({ modifiers: ['ControlOrMeta'] });
    await window.keyboard.press('ControlOrMeta+g');
    await waitForSaved(window);

    // Draw a third rect, sibling of the new group.
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 360, y: 80 }, { x: 460, y: 180 });
    await waitForSaved(window);

    // 4 rects total: G1 wrapper + 2 children + solo sibling.
    await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(4);

    // Find the G1 wrapper (the one with display:flex, not the children,
    // not the solo). It's the selected element right after the Cmd+G.
    // Easier: select G1 + solo via the layers panel — G1 is the parent
    // of firstClass, and the solo is the rect that isn't firstClass,
    // secondClass, or G1.
    const allClasses = await canvasElementsByPrefix(window, 'rect_').evaluateAll(
      (els) => els.map((el) => (el as HTMLElement).dataset.scampId ?? '')
    );
    const otherClasses = allClasses.filter(
      (c) => c !== firstClass && c !== secondClass
    );
    expect(otherClasses).toHaveLength(2);
    const [wrapperClassA, wrapperClassB] = otherClasses;

    // Cmd+G on G1 + the sibling rect makes a new wrapper around them.
    await layersRowByClass(window, wrapperClassA!).click();
    await layersRowByClass(window, wrapperClassB!).click({ modifiers: ['ControlOrMeta'] });
    await window.keyboard.press('ControlOrMeta+g');
    await waitForSaved(window);

    // Now 5 rects total (outer-group + G1 + G1-children + solo).
    await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(5);
  });
});
