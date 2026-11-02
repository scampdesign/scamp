import { test, expect } from '../../fixtures/app';
import { openComponentsSection } from '../../fixtures/components';
import { dragInFrame, selectTool } from '../../fixtures/canvas';
import {
  canvasElementsByPrefix,
  componentSidebarItem,
  pageRoot,
} from '../../fixtures/selectors';
import { measureFrame, frameToClient } from '../../fixtures/canvas';
import { waitForSaved } from '../../fixtures/assertions';

test.use({ projectOptions: { format: 'nextjs' } });

test.describe('components: convert element to component', () => {
  test('replaces the element on the page with an instance reference (NOT the element body)', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();

    // Draw two rectangles so we can verify "other elements survive".
    await selectTool(window, 'r');
    await dragInFrame(window, { x: 100, y: 100 }, { x: 220, y: 200 });
    const rectA = canvasElementsByPrefix(window, 'rect_').first();
    const rectAClass = await rectA.getAttribute('data-scamp-id');
    expect(rectAClass).toMatch(/^rect_[a-z0-9]+$/);

    await selectTool(window, 'r');
    await dragInFrame(window, { x: 300, y: 100 }, { x: 420, y: 200 });
    const allRects = canvasElementsByPrefix(window, 'rect_');
    await expect(allRects).toHaveCount(2);
    // Capture rectB's class BEFORE the conversion removes it from the
    // page tree. After the convert, only rectA remains and the locator
    // would point at the wrong element.
    const rectBClass = await allRects.nth(1).getAttribute('data-scamp-id');
    expect(rectBClass).toMatch(/^rect_[a-z0-9]+$/);

    // Wait for the page write to land BEFORE we open the convert flow,
    // so the lastSerialized cache reflects the two-rect state.
    await waitForSaved(window);

    // Switch to the select tool — drawing tool is still active and would
    // intercept clicks/right-clicks on the canvas as new draws.
    await selectTool(window, 'v');

    // Right-click in the centre of rect B (300-420, 100-200 → ~360, 150).
    // The interaction-layer's onContextMenu hit-tests at clientX/clientY
    // to find the element under the cursor.
    const metrics = await measureFrame(window);
    const target = frameToClient(metrics, { x: 360, y: 150 });
    await window.mouse.click(target.x, target.y, { button: 'right' });

    // Click "Create component…" in the menu.
    await window.getByRole('menuitem', { name: /Create component/i }).click();

    // Name input dialog opens — type a PascalCase name + confirm.
    const input = window.getByPlaceholder('ComponentName');
    await input.fill('Hero');
    await input.press('Enter');

    // Component editor opens; activate the Components section to see the
    // sidebar list (the rail defaults to Pages).
    await openComponentsSection(window);
    await expect(componentSidebarItem(window, 'Hero')).toBeVisible();

    // Component file exists on disk.
    expect(await project.componentExists('Hero')).toBe(true);

    // Navigate back to home by clicking the home sidebar button. The
    // header button is the only sidebar entry whose label matches.
    await window.getByRole('button', { name: /^home$/i }).first().click();
    await expect(pageRoot(window)).toBeVisible();

    // Settle the sync bridge so on-disk state reflects the rewritten
    // page (instance reference, not the rect's body).
    await waitForSaved(window);

    const { tsx: homeTsx, css: homeCss } = await project.readPage('home');

    // CRITICAL regression assertion: home file must have a JSX tag
    // referencing the Hero component, NOT a literal `<div data-scamp-id="rect_*">`
    // for the converted rectangle.
    expect(homeTsx).toMatch(
      /<Hero\s[^>]*data-scamp-instance-id="inst_[a-z0-9_]+"[^>]*\/>/
    );
    expect(homeTsx).toContain(
      "import Hero from '@/components/Hero/Hero';"
    );

    // Other (un-converted) rect SURVIVES on the page.
    expect(homeTsx).toContain(`data-scamp-id="${rectAClass}"`);
    expect(homeCss).toContain(`.${rectAClass}`);

    // The CONVERTED rect's id no longer appears on the page (it lives
    // inside the component now, with a fresh id space).
    expect(homeTsx).not.toContain(`data-scamp-id="${rectBClass}"`);
  });
});
