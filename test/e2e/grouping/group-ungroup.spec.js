import { test, expect } from '../fixtures/app';
import { dragInFrame, selectTool } from '../fixtures/canvas';
import { layersRowByClass, layersRows } from '../fixtures/layers';
import { canvasElementsByPrefix, pageRoot } from '../fixtures/selectors';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';
test.describe('grouping: Cmd+G / Cmd+Shift+G', () => {
    test('Cmd+G wraps selected siblings in a flex group with display:flex', async ({ window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        // Two sibling rects on the page root.
        await selectTool(window, 'r');
        await dragInFrame(window, { x: 80, y: 80 }, { x: 200, y: 180 });
        await waitForSaved(window);
        const firstClass = await canvasElementsByPrefix(window, 'rect_').first().getAttribute('data-scamp-id');
        await selectTool(window, 'r');
        await dragInFrame(window, { x: 260, y: 80 }, { x: 380, y: 180 });
        await waitForSaved(window);
        const secondClass = await canvasElementsByPrefix(window, 'rect_').nth(1).getAttribute('data-scamp-id');
        if (!firstClass || !secondClass)
            throw new Error('did not create two rects');
        // Multi-select: click first row, Cmd-click second row.
        await layersRowByClass(window, firstClass).click();
        await layersRowByClass(window, secondClass).click({ modifiers: ['ControlOrMeta'] });
        // Cmd+G — ProjectShell's handler groups the current selection.
        await window.keyboard.press('ControlOrMeta+g');
        await waitForSaved(window);
        // Three rect_ elements exist now: the wrapper + the two originals.
        await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(3);
        const { css, tsx } = await readPageFiles(project.dir, project.pageName);
        // The wrapper emits display: flex.
        const wrapperMatch = css.match(/\.rect_[a-z0-9]+\s*\{[^}]*display:\s*flex[^}]*\}/);
        expect(wrapperMatch).not.toBeNull();
        // Both originals now sit inside the wrapper in the TSX.
        expect(tsx).toMatch(new RegExp(`<div[^>]*class[^>]*\\b${firstClass}\\b`, 's'));
        // Children of the group have x/y reset to 0 — so they no longer emit
        // `left: …px` / `top: …px` declarations.
        expect(css).not.toMatch(new RegExp(`\\.${firstClass}\\s*\\{[^}]*left:\\s*80px`));
    });
    test('Cmd+Shift+G ungroups a selected group wrapper', async ({ window }) => {
        await expect(pageRoot(window)).toBeVisible();
        // Build the group.
        await selectTool(window, 'r');
        await dragInFrame(window, { x: 80, y: 80 }, { x: 180, y: 180 });
        await selectTool(window, 'r');
        await dragInFrame(window, { x: 220, y: 80 }, { x: 320, y: 180 });
        const firstClass = await canvasElementsByPrefix(window, 'rect_').first().getAttribute('data-scamp-id');
        const secondClass = await canvasElementsByPrefix(window, 'rect_').nth(1).getAttribute('data-scamp-id');
        if (!firstClass || !secondClass)
            throw new Error('failed to create rects');
        await layersRowByClass(window, firstClass).click();
        await layersRowByClass(window, secondClass).click({ modifiers: ['ControlOrMeta'] });
        await window.keyboard.press('ControlOrMeta+g');
        await waitForSaved(window);
        await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(3);
        // The new group wrapper is the auto-selected element after Cmd+G —
        // Ungroup with Cmd+Shift+G.
        await window.keyboard.press('ControlOrMeta+Shift+g');
        await waitForSaved(window);
        // Back to two rects (wrapper removed, children promoted).
        await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(2);
        // Layers panel now lists the two originals under Page.
        await expect(layersRows(window)).toHaveCount(3); // Page + 2 rects
    });
});
