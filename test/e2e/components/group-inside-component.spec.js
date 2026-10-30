import { test, expect } from '../fixtures/app';
import { dragInFrame, selectTool } from '../fixtures/canvas';
import { createComponentFromSidebar, openPagesSection, } from '../fixtures/components';
import { layersRowByClass } from '../fixtures/layers';
import { canvasElementsByPrefix, pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';
test.use({ projectOptions: { format: 'nextjs' } });
test.describe('components: Cmd+G inside the component editor', () => {
    test('groups two sibling rects inside a component into a flex wrapper', async ({ window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await createComponentFromSidebar(window, 'Card');
        // Draw two sibling rects in the component editor.
        await selectTool(window, 'r');
        await dragInFrame(window, { x: 60, y: 60 }, { x: 160, y: 140 });
        await waitForSaved(window);
        const firstClass = await canvasElementsByPrefix(window, 'rect_')
            .first()
            .getAttribute('data-scamp-id');
        await selectTool(window, 'r');
        await dragInFrame(window, { x: 200, y: 60 }, { x: 300, y: 140 });
        await waitForSaved(window);
        const secondClass = await canvasElementsByPrefix(window, 'rect_')
            .nth(1)
            .getAttribute('data-scamp-id');
        if (!firstClass || !secondClass)
            throw new Error('did not create two rects');
        await layersRowByClass(window, firstClass).click();
        await layersRowByClass(window, secondClass).click({ modifiers: ['ControlOrMeta'] });
        await window.keyboard.press('ControlOrMeta+g');
        await waitForSaved(window);
        // Three rect_ elements exist now: the wrapper + the two originals.
        await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(3);
        const { css, tsx } = await project.readComponent('Card');
        expect(css).toMatch(/\.rect_[a-z0-9]+\s*\{[^}]*display:\s*flex/);
        expect(tsx).toContain(`data-scamp-id="${firstClass}"`);
        expect(tsx).toContain(`data-scamp-id="${secondClass}"`);
    });
    test('groups a component instance with a sibling rect on a page', async ({ window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await createComponentFromSidebar(window, 'Card');
        // Go back to home so we can drop a Card instance onto the page. The
        // home page button lives in the Pages sidebar section, which the
        // create flow switched away from.
        await openPagesSection(window);
        await window.getByRole('button', { name: /^home$/i }).first().click();
        await expect(pageRoot(window)).toBeVisible();
        await waitForSaved(window);
        // Drop an instance + draw a sibling rect.
        const { dragComponentToCanvas } = await import('../fixtures/components');
        const { measureFrame, frameToClient } = await import('../fixtures/canvas');
        const metrics = await measureFrame(window);
        const drop = frameToClient(metrics, { x: 140, y: 140 });
        await dragComponentToCanvas(window, 'Card', drop.x, drop.y);
        await waitForSaved(window);
        await selectTool(window, 'r');
        await dragInFrame(window, { x: 300, y: 80 }, { x: 420, y: 180 });
        await waitForSaved(window);
        const rectClass = await canvasElementsByPrefix(window, 'rect_')
            .first()
            .getAttribute('data-scamp-id');
        if (!rectClass)
            throw new Error('rect not created');
        // Multi-select the instance + the rect via the layers panel, which
        // lives in the Pages section — the drag helper switched to Components
        // to find the draggable row, so switch back.
        await openPagesSection(window);
        const layersInstanceRow = window.getByRole('button', {
            name: /^Card$/,
        });
        await layersInstanceRow.last().click();
        await layersRowByClass(window, rectClass).click({ modifiers: ['ControlOrMeta'] });
        await window.keyboard.press('ControlOrMeta+g');
        await waitForSaved(window);
        // Wrapper appears on the page; the instance + rect now nest inside.
        const { tsx, css } = await project.readPage('home');
        expect(css).toMatch(/\.rect_[a-z0-9]+\s*\{[^}]*display:\s*flex/);
        expect(tsx).toContain('<Card ');
        expect(tsx).toContain(`data-scamp-id="${rectClass}"`);
    });
});
