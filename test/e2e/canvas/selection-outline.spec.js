import { test, expect } from '../fixtures/app';
import { drawAndSelectRect } from '../fixtures/panel';
import { canvasElement, pageRoot } from '../fixtures/selectors';
/**
 * A selected element is outlined on the element itself, on today's canvas
 * and on the iframe canvas experiment (`SCAMP_E2E_IFRAME=1`) alike.
 */
test.describe('canvas: selection outline', () => {
    test('outlines the selected element, each of a multi-select, and none once deselected', async ({ window }) => {
        await expect(pageRoot(window)).toBeVisible();
        const first = canvasElement(window, await drawAndSelectRect(window, { x: 40, y: 40 }, { x: 160, y: 120 }));
        const second = canvasElement(window, await drawAndSelectRect(window, { x: 220, y: 40 }, { x: 340, y: 120 }));
        await expect(second).toHaveCSS('outline-style', 'solid');
        await expect(second).toHaveCSS('outline-width', '2px');
        await expect(first).toHaveCSS('outline-style', 'none');
        const box = await first.boundingBox();
        if (box === null)
            throw new Error('first rect not on screen');
        await window.keyboard.down('Shift');
        await window.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await window.keyboard.up('Shift');
        await expect(first).toHaveCSS('outline-style', 'solid');
        await expect(second).toHaveCSS('outline-style', 'solid');
        // Empty page: the root takes the selection, and the rects lose theirs.
        const right = await second.boundingBox();
        if (right === null)
            throw new Error('second rect not on screen');
        await window.mouse.click(right.x + right.width + 100, right.y + right.height / 2);
        await expect(first).toHaveCSS('outline-style', 'none');
        await expect(second).toHaveCSS('outline-style', 'none');
    });
});
