import { test, expect } from '../fixtures/app';
import { commitInput, drawAndSelectRect, panelInputByPrefix, panelSection } from '../fixtures/panel';
import { canvasElement, pageRoot } from '../fixtures/selectors';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';
test.describe('properties panel: transform', () => {
    test('"+ Add transform" emits a no-op translate, and editing X writes the offset', async ({ window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        const className = await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 260, y: 200 });
        await waitForSaved(window);
        const section = panelSection(window, 'Transform');
        // Collapsible, and collapsed until the element has a transform.
        await section.getByRole('button', { name: 'Transform' }).click();
        await section.getByRole('button', { name: '+ Add transform' }).click();
        await waitForSaved(window);
        let files = await readPageFiles(project.dir, project.pageName);
        expect(files.css).toMatch(new RegExp(`\\.${className}[^}]*transform:\\s*translate\\(0px, 0px\\)`, 's'));
        await commitInput(panelInputByPrefix(window, 'Transform', 'X'), '-50%');
        await waitForSaved(window);
        files = await readPageFiles(project.dir, project.pageName);
        expect(files.css).toMatch(new RegExp(`\\.${className}[^}]*transform:\\s*translate\\(-50%, 0px\\)`, 's'));
    });
    test('the canvas draws the transform — a rotated box changes its bounding box', async ({ window, }) => {
        await expect(pageRoot(window)).toBeVisible();
        const className = await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 260, y: 200 });
        await waitForSaved(window);
        const box = canvasElement(window, className).first();
        const before = await box.boundingBox();
        const section = panelSection(window, 'Transform');
        await section.getByRole('button', { name: 'Transform' }).click();
        await section.getByRole('button', { name: '+ Add transform' }).click();
        // Switch the row to Rotate and give it 45°.
        await section.locator('select').first().selectOption('rotate');
        await commitInput(panelInputByPrefix(window, 'Transform', 'Angle'), '45');
        await waitForSaved(window);
        // A 160×100 box rotated 45° has a taller, wider AABB than 160×100.
        await expect
            .poll(async () => {
            const after = await box.boundingBox();
            return after && before ? Math.round(after.height - before.height) : 0;
        })
            .toBeGreaterThan(40);
    });
});
