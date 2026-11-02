import { test, expect, stubOpenDialog, writeFixtureSvg } from '../fixtures/app';
import { dragInFrame, selectTool } from '../fixtures/canvas';
import { panelSection } from '../fixtures/panel';
import { canvasElementsByPrefix, canvasLocator, pageRoot } from '../fixtures/selectors';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';
// The canvas SVG element: a real <svg> carrying a data-scamp-id. Editor
// chrome (selection lock badge, tabler icons) also renders <svg>s, but
// only canvas elements carry data-scamp-id — so this is unambiguous.
const canvasSvg = (page) => canvasLocator(page, 'svg[data-scamp-id]');
/** Open the image tool WITHOUT clearing the current selection (unlike the
 *  keyboard shortcut, which clicks the canvas first). */
const openImageTool = async (page) => {
    await page.getByRole('button', { name: 'Image', exact: true }).click();
};
test.describe('elements: SVG import', () => {
    test('image tool inlines an SVG with a viewBox (not an <img>)', async ({ window, app, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        const svgPath = await writeFixtureSvg();
        await stubOpenDialog(app, svgPath);
        await selectTool(window, 'i');
        // The SVG inserts immediately (no draw-to-size) as a real inline <svg>.
        const svg = canvasSvg(window);
        await expect(svg).toBeVisible({ timeout: 10_000 });
        // viewBox is what lets the artwork scale with the element box.
        await expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
        await waitForSaved(window);
        const { tsx } = await readPageFiles(project.dir, project.pageName);
        expect(tsx).toContain('<svg');
        expect(tsx).toContain('viewBox="0 0 24 24"');
        // The asset reference round-trips for the reload watcher.
        expect(tsx).toContain('data-scamp-svg-src');
        // Per-shape colours are preserved (not stripped).
        expect(tsx).toContain('#ff0000');
        expect(tsx).toContain('#00ff00');
    });
    test('an imported SVG nests inside the selected container', async ({ window, app, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        // Draw a rectangle — it becomes the active selection.
        await selectTool(window, 'r');
        await dragInFrame(window, { x: 80, y: 80 }, { x: 320, y: 300 });
        const rect = canvasElementsByPrefix(window, 'rect_').first();
        await expect(rect).toBeVisible();
        // Import with the rectangle selected. Use the toolbar button so the
        // selection is preserved (the keyboard shortcut clicks the canvas).
        const svgPath = await writeFixtureSvg('nested.svg');
        await stubOpenDialog(app, svgPath);
        await openImageTool(window);
        // The SVG lands INSIDE the rectangle (DOM descendant), not at the root.
        await expect(rect.locator('svg[data-scamp-id]')).toBeVisible({
            timeout: 10_000,
        });
        await waitForSaved(window);
        const { tsx } = await readPageFiles(project.dir, project.pageName);
        // Structural: the <svg> appears nested within the rect's <div>.
        expect(tsx).toMatch(/<div[^>]*data-scamp-id="rect_[^"]*"[^>]*>[\s\S]*<svg/);
    });
    test('editing an SVG colour persists to disk', async ({ window, app, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        const svgPath = await writeFixtureSvg('recolor.svg');
        await stubOpenDialog(app, svgPath);
        await selectTool(window, 'i');
        await expect(canvasSvg(window)).toBeVisible({ timeout: 10_000 });
        await waitForSaved(window);
        // The imported SVG is selected → the SVG section shows a swatch per
        // colour. Retint the first (#ff0000) via its hex input.
        const section = panelSection(window, 'SVG');
        const firstColor = section.locator('input[type="text"]').first();
        await firstColor.click();
        await firstColor.fill('#123456');
        await firstColor.press('Enter');
        await waitForSaved(window);
        const { tsx } = await readPageFiles(project.dir, project.pageName);
        // The rewritten colour is in the persisted svgSource; the old one gone.
        expect(tsx).toContain('#123456');
        expect(tsx).not.toContain('#ff0000');
    });
    test('editing the Current color of a currentColor SVG persists to disk', async ({ window, app, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        // A monochrome, currentColor-based icon (Lucide/Tabler shape).
        const svgPath = await writeFixtureSvg('mono.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">' +
            '<path d="M4 6h16" stroke="currentColor" stroke-width="2" fill="none"/></svg>');
        await stubOpenDialog(app, svgPath);
        await selectTool(window, 'i');
        await expect(canvasSvg(window)).toBeVisible({ timeout: 10_000 });
        await waitForSaved(window);
        // The "Current color" swatch edits the element's CSS `color` (typed
        // field) — this is the path that previously failed to persist.
        const section = panelSection(window, 'SVG');
        // Target the "Current color" row's hex field specifically (the last
        // input in the section is the stroke-width number field).
        const colorInput = section
            .locator('div:has(> span:text-is("Current color")) input[type="text"]')
            .first();
        await colorInput.click();
        await colorInput.fill('#3366ff');
        await colorInput.press('Enter');
        await waitForSaved(window);
        const { css } = await readPageFiles(project.dir, project.pageName);
        expect(css).toContain('color: #3366ff;');
    });
});
