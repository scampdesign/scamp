import { test, expect } from '../fixtures/app';
import { dragInFrame, selectTool } from '../fixtures/canvas';
import {
  drawAndSelectRect,
  panelSection,
} from '../fixtures/panel';
import { canvasLocator, pageRoot } from '../fixtures/selectors';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';

test.describe('elements: list context defaults', () => {
  test('drawing a rect inside a <ul> defaults its tag to <li>', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();

    // Step 1: make the outer rect a <ul>.
    const outerClass = await drawAndSelectRect(
      window,
      { x: 60, y: 60 },
      { x: 400, y: 400 }
    );
    await waitForSaved(window);
    await panelSection(window, 'Element').locator('select').first().selectOption('ul');
    await waitForSaved(window);

    // Step 2: draw a new rect that sits inside the ul.
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 120, y: 120 }, { x: 300, y: 240 });

    // Pick the nested rect by excluding the outer's own data-scamp-id.
    const nestedRect = canvasLocator(
      window,
      `[data-scamp-id^="rect_"]:not([data-scamp-id="${outerClass}"])`
    ).first();
    await nestedRect.waitFor();
    const nestedClass = await nestedRect.getAttribute('data-scamp-id');
    if (!nestedClass || nestedClass === outerClass) {
      throw new Error('could not find nested rect');
    }
    await waitForSaved(window);

    const { tsx } = await readPageFiles(project.dir, project.pageName);
    // Outer is <ul>, inner defaults to <li>.
    expect(tsx).toMatch(new RegExp(`<ul[^>]*data-scamp-id="${outerClass}"`));
    expect(tsx).toMatch(new RegExp(`<li[^>]*data-scamp-id="${nestedClass}"`));
  });
});
