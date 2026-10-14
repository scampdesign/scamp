import { test, expect, stubOpenDialog, writeFixtureImageOutside } from '../fixtures/app';
import { dragInFrame, selectTool } from '../fixtures/canvas';
import { layersRowByClass } from '../fixtures/layers';
import { canvasElementsByPrefix, pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';
/**
 * What the layers tree promises before you let go: a highlighted row for
 * "drop inside", an indented line for "drop beside".
 *
 * `dropZones.test.ts` pins the before/inside/after rule itself; this
 * covers the wiring — that the tree feeds real geometry into it, shows
 * the matching indicator, and drops where the indicator said.
 * see docs/archive/2026-08-13-drop-placement-helpers-plan.md
 */
const DRAG_MIME = 'application/x-scamp-element-id';
/**
 * Dispatch a dragover at a fraction of the target row's height, WITHOUT
 * dropping — so the indicator can be inspected mid-drag. Playwright's
 * `dragTo` doesn't fire HTML5 drag events, hence the manual dispatch.
 */
const dragOverRow = async (page, sourceClass, targetClass, fraction) => {
    await page.evaluate(({ sourceSel, targetSel, frac, mime }) => {
        const panel = '[data-testid="layers-panel"]';
        const src = document.querySelector(`${panel} [data-element-class="${sourceSel}"]`);
        const dst = document.querySelector(`${panel} [data-element-class="${targetSel}"]`);
        if (!src || !dst)
            throw new Error('source or target row not found');
        const dataTransfer = new DataTransfer();
        dataTransfer.setData(mime, src.dataset['elementId'] ?? '');
        src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
        const rect = dst.getBoundingClientRect();
        dst.dispatchEvent(new DragEvent('dragover', {
            bubbles: true,
            cancelable: true,
            dataTransfer,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height * frac,
        }));
    }, { sourceSel: sourceClass, targetSel: targetClass, frac: fraction, mime: DRAG_MIME });
};
/** Draw `count` sibling rects and return their classes in tree order. */
async function drawRects(page, count) {
    await expect(pageRoot(page)).toBeVisible();
    for (let i = 0; i < count; i += 1) {
        await selectTool(page, 'r');
        const x = 60 + i * 160;
        await dragInFrame(page, { x, y: 60 }, { x: x + 120, y: 180 });
    }
    await waitForSaved(page);
    const classes = await canvasElementsByPrefix(page, 'rect_').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-scamp-id') ?? ''));
    if (classes.length !== count) {
        throw new Error(`expected ${count} rects, got ${classes.join()}`);
    }
    return classes;
}
/** The drop line rendered inside a row, if any. */
const dropLine = (page, className) => layersRowByClass(page, className).locator('div[class*="dropLine"]');
test.describe('layers panel: drop placement feedback', () => {
    test('the middle of a rectangle row offers "inside"', async ({ window }) => {
        const [first, second] = await drawRects(window, 2);
        await dragOverRow(window, second, first, 0.5);
        // The row highlights and no insertion line is shown — the two states
        // are exclusive, which is the whole point of the disambiguation.
        await expect(layersRowByClass(window, first)).toHaveClass(/rowDropInside/);
        await expect(dropLine(window, first)).toHaveCount(0);
    });
    test('the top band of the same row offers "beside" instead', async ({ window, }) => {
        const [first, second] = await drawRects(window, 2);
        await dragOverRow(window, second, first, 0.05);
        await expect(layersRowByClass(window, first)).not.toHaveClass(/rowDropInside/);
        await expect(dropLine(window, first)).toHaveCount(1);
    });
    test('an image row never offers "inside"', async ({ window, app, project }) => {
        // The regression: the tree used to allow "inside" on anything that
        // wasn't text, so an image could be given children.
        const [rect] = await drawRects(window, 1);
        const fixture = await writeFixtureImageOutside('pixel.png');
        await stubOpenDialog(app, fixture);
        await selectTool(window, 'i');
        await dragInFrame(window, { x: 300, y: 260 }, { x: 400, y: 360 });
        await waitForSaved(window);
        const imgClass = await canvasElementsByPrefix(window, 'img_')
            .first()
            .getAttribute('data-scamp-id');
        if (!imgClass)
            throw new Error('no image element on the canvas');
        // Dead centre of the image row — the most "inside" position there is.
        await dragOverRow(window, rect, imgClass, 0.5);
        await expect(layersRowByClass(window, imgClass)).not.toHaveClass(/rowDropInside/);
        await expect(dropLine(window, imgClass)).toHaveCount(1);
    });
    test('the insertion line is indented to the depth it drops at', async ({ window, }) => {
        // A line at a fixed indent reads as "somewhere around here"; indenting
        // it to the target's depth says which level it will join.
        const [outer] = await drawRects(window, 1);
        await selectTool(window, 'r');
        await dragInFrame(window, { x: 80, y: 80 }, { x: 160, y: 160 });
        await waitForSaved(window);
        const classes = await canvasElementsByPrefix(window, 'rect_').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-scamp-id') ?? ''));
        const inner = classes.find((c) => c !== outer);
        if (!inner)
            throw new Error('expected a nested rect');
        // Drop beside the NESTED rect: its line sits one indent deeper than
        // one beside its parent would.
        await dragOverRow(window, outer, inner, 0.05);
        const nestedLeft = await dropLine(window, inner).evaluate((el) => el.style.left);
        await dragOverRow(window, inner, outer, 0.05);
        const outerLeft = await dropLine(window, outer).evaluate((el) => el.style.left);
        expect(parseInt(nestedLeft, 10)).toBeGreaterThan(parseInt(outerLeft, 10));
    });
});
