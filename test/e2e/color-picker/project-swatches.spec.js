import { test, expect } from '../fixtures/app';
import { dragInFrame, selectTool } from '../fixtures/canvas';
import { drawAndSelectRect, panelSection } from '../fixtures/panel';
import { canvasElementsByPrefix, pageRoot, } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';
/**
 * Colors already applied in the project bubble up into the color
 * picker's preset palette. The SketchPicker renders preset swatches as
 * small divs whose inline `background` reflects the color, so we
 * assert directly on that style.
 */
test.describe('color picker: project swatches', () => {
    test('a previously-used color appears in the preset strip when picking a new element', async ({ window, }) => {
        await expect(pageRoot(window)).toBeVisible();
        // Element A — apply a recognizable color.
        const firstClass = await drawAndSelectRect(window, { x: 80, y: 80 }, { x: 200, y: 160 });
        const colorText = panelSection(window, 'Background')
            .locator('input[type="text"]')
            .first();
        await colorText.click();
        await colorText.fill('#123456');
        await colorText.press('Enter');
        await waitForSaved(window);
        expect(firstClass).toBeDefined();
        // Element B — select it, open the color picker, check the preset
        // strip contains an entry whose background color resolves to A's.
        await selectTool(window, 'r');
        await dragInFrame(window, { x: 300, y: 80 }, { x: 420, y: 160 });
        await canvasElementsByPrefix(window, 'rect_').nth(1).waitFor();
        // Open the color picker. The swatch button has no accessible name
        // via Tooltip; target the first button in the Background section.
        await panelSection(window, 'Background').locator('button').first().click();
        // SketchPicker renders presets as small divs. Use a JS evaluation
        // so we can compare computed background colors tolerantly (the
        // SketchPicker re-emits the hex as rgb()).
        const matched = await window.evaluate((expectedHex) => {
            const hexToRgb = (hex) => {
                const m = hex.replace('#', '');
                return {
                    r: parseInt(m.slice(0, 2), 16),
                    g: parseInt(m.slice(2, 4), 16),
                    b: parseInt(m.slice(4, 6), 16),
                };
            };
            const parseRgb = (style) => {
                const m = style.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (!m)
                    return null;
                return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
            };
            const target = hexToRgb(expectedHex);
            // The iframe canvas experiment draws from a stylesheet, not inline styles.
            const drawn = document.querySelector('[data-testid="iframe-canvas"] iframe')?.contentDocument;
            const nodes = (drawn ?? document).querySelectorAll('div');
            for (const node of nodes) {
                const bg = drawn
                    ? (drawn.defaultView?.getComputedStyle(node).backgroundColor ?? '')
                    : node.style.background || node.style.backgroundColor;
                if (!bg)
                    continue;
                const rgb = parseRgb(bg);
                if (!rgb)
                    continue;
                if (rgb.r === target.r && rgb.g === target.g && rgb.b === target.b) {
                    return true;
                }
            }
            return false;
        }, '#123456');
        expect(matched).toBe(true);
    });
});
