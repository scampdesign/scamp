import { test, expect, stubOpenDialog } from '../fixtures/app';
import { drawAndSelectRect } from '../fixtures/panel';
import { layersRowByClass } from '../fixtures/layers';
import { canvasElementsByPrefix, pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';
/**
 * The left panel resizes by its right edge, collapses, and remembers both.
 * see docs/plans/resizable-sidebar-plan.md
 */
const LONG_NAME = 'Hero Card Primary Action Label Wide';
const sidebar = (window) => window.getByTestId('sidebar-panel');
const edge = (window) => window.getByRole('separator', { name: 'Resize the left panel' });
const pagesButton = (window) => window.getByTestId('sidebar-rail').locator('[data-section="pages"]');
const widthOf = async (locator) => (await locator.boundingBox())?.width ?? 0;
const dragEdgeBy = async (window, dx) => {
    const box = await edge(window).boundingBox();
    if (box === null)
        throw new Error('no sidebar edge');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await window.mouse.move(x, y);
    await window.mouse.down();
    await window.mouse.move(x + dx, y, { steps: 8 });
    await window.mouse.up();
};
/** A rect named `LONG_NAME`, and its row's label. */
const longNamedLayer = async (window) => {
    const cls = await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 260, y: 200 });
    await waitForSaved(window);
    const row = layersRowByClass(window, cls);
    await row.dblclick();
    const input = row.locator('input').first();
    await input.fill(LONG_NAME);
    await input.press('Enter');
    await waitForSaved(window);
    const renamed = await canvasElementsByPrefix(window, 'hero_card_').first().getAttribute('data-scamp-id');
    if (!renamed)
        throw new Error('rename did not take effect');
    const renamedRow = layersRowByClass(window, renamed);
    return { row: renamedRow, label: renamedRow.getByText(LONG_NAME) };
};
const isCutOff = (label) => label.evaluate((el) => el.scrollWidth > el.clientWidth);
test.describe('project view: resizable left panel', () => {
    test('dragging the edge widens the panel until a long layer name shows in full', async ({ window }) => {
        await expect(pageRoot(window)).toBeVisible();
        const { row, label } = await longNamedLayer(window);
        expect(await widthOf(sidebar(window))).toBe(240);
        expect(await isCutOff(label)).toBe(true);
        await dragEdgeBy(window, 400);
        expect(await widthOf(sidebar(window))).toBe(480);
        expect(await isCutOff(label)).toBe(false);
        // The tooltip names the layer in full, over its class.
        await row.locator('button').filter({ hasText: LONG_NAME }).hover();
        const tooltip = window.getByRole('tooltip');
        await expect(tooltip).toContainText(LONG_NAME);
        await expect(tooltip).toContainText('.hero_card_');
    });
    test('double-clicking the edge resets it, and the width survives reopening the project', async ({ app, window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await dragEdgeBy(window, 100);
        expect(await widthOf(sidebar(window))).toBe(340);
        await window.getByRole('button', { name: '← Projects' }).click();
        await stubOpenDialog(app, project.dir);
        await window.getByRole('button', { name: 'Open Project' }).click();
        await expect(pageRoot(window)).toBeVisible();
        expect(await widthOf(sidebar(window))).toBe(340);
        await edge(window).dblclick();
        await expect.poll(() => widthOf(sidebar(window))).toBe(240);
    });
    test('the arrow keys move the edge, and stop at the limits', async ({ window }) => {
        await expect(pageRoot(window)).toBeVisible();
        await edge(window).focus();
        await window.keyboard.press('ArrowRight');
        await expect(edge(window)).toHaveAttribute('aria-valuenow', '256');
        await window.keyboard.press('Home');
        await expect(edge(window)).toHaveAttribute('aria-valuenow', '200');
        await window.keyboard.press('ArrowLeft');
        await expect(edge(window)).toHaveAttribute('aria-valuenow', '200');
        await window.keyboard.press('End');
        await expect(edge(window)).toHaveAttribute('aria-valuenow', '480');
    });
    test('the open section’s rail button and Cmd+B collapse the panel, and open it at its width', async ({ window, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await dragEdgeBy(window, 60);
        expect(await widthOf(sidebar(window))).toBe(300);
        await pagesButton(window).click();
        await expect(sidebar(window)).toHaveCount(0);
        await expect(pagesButton(window)).toHaveAttribute('aria-expanded', 'false');
        await pagesButton(window).click();
        await expect(sidebar(window)).toBeVisible();
        expect(await widthOf(sidebar(window))).toBe(300);
        await window.keyboard.press('ControlOrMeta+b');
        await expect(sidebar(window)).toHaveCount(0);
        await window.keyboard.press('ControlOrMeta+b');
        await expect(sidebar(window)).toBeVisible();
    });
    test('dragging the edge past its minimum collapses the panel', async ({ window }) => {
        await expect(pageRoot(window)).toBeVisible();
        await dragEdgeBy(window, -200);
        await expect(sidebar(window)).toHaveCount(0);
        // Another section opens it again, at the width it had before the drag.
        await window.getByTestId('sidebar-rail').locator('[data-section="components"]').click();
        await expect(sidebar(window)).toBeVisible();
        expect(await widthOf(sidebar(window))).toBe(240);
    });
});
