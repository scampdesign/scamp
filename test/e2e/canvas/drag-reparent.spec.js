import { test, expect } from '../fixtures/app';
import { dragInFrame, frameToClient, measureFrame, selectTool, } from '../fixtures/canvas';
import { drawAndSelectRect, panelSection } from '../fixtures/panel';
import { layersRowByClass } from '../fixtures/layers';
import { canvasElement, canvasElementsByPrefix, pageRoot, } from '../fixtures/selectors';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';
/**
 * Canvas drag-to-reparent — real pointer dragging on the canvas (distinct
 * from the layers-panel DnD covered by reorder-dnd.spec).
 * see docs/plans/canvas-drag-reparent-plan.md
 */
/** Assert `inner`'s element sits inside `outer`'s element in the TSX. */
const expectNestedInTsx = (tsx, outer, inner) => {
    const outerStart = tsx.indexOf(`data-scamp-id="${outer}"`);
    const innerStart = tsx.indexOf(`data-scamp-id="${inner}"`);
    const outerEnd = tsx.indexOf('</div>', outerStart);
    expect(outerStart).toBeGreaterThan(-1);
    expect(innerStart).toBeGreaterThan(outerStart);
    expect(innerStart).toBeLessThan(outerEnd);
};
/** The declaration body of a single class block, or '' if absent. */
const cssBlock = (css, cls) => {
    const m = css.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`, 's'));
    return m?.[1] ?? '';
};
/**
 * Grab an element by its rendered centre (client coords) and drag to a
 * frame-local point. Used when the element's position isn't known ahead
 * of time (e.g. a flex child placed by layout).
 */
const dragElementToFrame = async (window, className, to) => {
    const box = await canvasElement(window, className).boundingBox();
    if (!box)
        throw new Error(`no bounding box for ${className}`);
    const metrics = await measureFrame(window);
    const target = frameToClient(metrics, to);
    await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await window.mouse.down();
    await window.mouse.move(target.x, target.y, { steps: 12 });
    await window.mouse.up();
};
test.describe('canvas: drag to reparent', () => {
    test('drags an absolute element into another absolute container', async ({ window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        // Container first (drawn first → painted under the moved element).
        const containerClass = await drawAndSelectRect(window, { x: 300, y: 100 }, { x: 620, y: 420 });
        const movedClass = await drawAndSelectRect(window, { x: 60, y: 60 }, { x: 160, y: 160 });
        await waitForSaved(window);
        // Drag the element from its centre (110,110) into the container.
        await selectTool(window, 'v');
        await dragInFrame(window, { x: 110, y: 110 }, { x: 460, y: 260 });
        await waitForSaved(window);
        const { tsx, css } = await readPageFiles(project.dir, project.pageName);
        expectNestedInTsx(tsx, containerClass, movedClass);
        // Still absolutely positioned, now in the container's local space.
        const block = cssBlock(css, movedClass);
        expect(block).toMatch(/left:\s*\d+px/);
        expect(block).toMatch(/top:\s*\d+px/);
    });
    test('drags an element into a flex container (the reported bug)', async ({ window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        const flexClass = await drawAndSelectRect(window, { x: 300, y: 100 }, { x: 620, y: 420 });
        await panelSection(window, 'Layout')
            .getByRole('radio', { name: 'Flex row' })
            .click();
        await waitForSaved(window);
        const movedClass = await drawAndSelectRect(window, { x: 60, y: 60 }, { x: 160, y: 160 });
        await waitForSaved(window);
        await selectTool(window, 'v');
        await dragInFrame(window, { x: 110, y: 110 }, { x: 460, y: 260 });
        await waitForSaved(window);
        const { tsx, css } = await readPageFiles(project.dir, project.pageName);
        expectNestedInTsx(tsx, flexClass, movedClass);
        // As a flex child it no longer carries absolute positioning.
        expect(cssBlock(css, movedClass)).not.toMatch(/position:\s*absolute/);
    });
    test('drags a flex child out to the page root (becomes absolute)', async ({ window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        // Two sibling rects → group into a flex container.
        await selectTool(window, 'r');
        await dragInFrame(window, { x: 100, y: 100 }, { x: 200, y: 200 });
        await waitForSaved(window);
        const firstClass = await canvasElementsByPrefix(window, 'rect_')
            .first()
            .getAttribute('data-scamp-id');
        await selectTool(window, 'r');
        await dragInFrame(window, { x: 240, y: 100 }, { x: 340, y: 200 });
        await waitForSaved(window);
        const secondClass = await canvasElementsByPrefix(window, 'rect_')
            .nth(1)
            .getAttribute('data-scamp-id');
        if (!firstClass || !secondClass)
            throw new Error('need two rects');
        await layersRowByClass(window, firstClass).click();
        await layersRowByClass(window, secondClass).click({ modifiers: ['Shift'] });
        await window.keyboard.press('ControlOrMeta+g');
        await waitForSaved(window);
        // Drag the second (now-flex) child out into empty page-root space.
        // The target is well clear of the group (top-left) and on-screen.
        await selectTool(window, 'v');
        await dragElementToFrame(window, secondClass, { x: 520, y: 460 });
        await waitForSaved(window);
        const { css } = await readPageFiles(project.dir, project.pageName);
        // Out in the absolute page root it regains explicit positioning.
        const block = cssBlock(css, secondClass);
        expect(block).toMatch(/left:\s*\d+px/);
        expect(block).toMatch(/top:\s*\d+px/);
    });
    test('refuses to drop an element onto its own descendant', async ({ window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        // Outer container + a smaller sibling.
        const outerClass = await drawAndSelectRect(window, { x: 80, y: 80 }, { x: 520, y: 520 });
        const innerClass = await drawAndSelectRect(window, { x: 600, y: 80 }, { x: 700, y: 180 });
        await waitForSaved(window);
        // Reparent inner INTO outer (the feature under test), landing near
        // outer's centre.
        await selectTool(window, 'v');
        await dragInFrame(window, { x: 650, y: 130 }, { x: 300, y: 300 });
        await waitForSaved(window);
        let tsx = (await readPageFiles(project.dir, project.pageName)).tsx;
        expectNestedInTsx(tsx, outerClass, innerClass);
        // Now grab outer at a spot NOT over inner (top-left) and drag the
        // cursor over inner (outer's descendant). The drop must be rejected —
        // outer can't become a child of its own child — so the nesting is
        // unchanged.
        await dragInFrame(window, { x: 120, y: 120 }, { x: 300, y: 300 });
        await waitForSaved(window);
        tsx = (await readPageFiles(project.dir, project.pageName)).tsx;
        expectNestedInTsx(tsx, outerClass, innerClass);
        // Outer is still a direct child of the page root (not nested in inner).
        const innerStart = tsx.indexOf(`data-scamp-id="${innerClass}"`);
        const outerStart = tsx.indexOf(`data-scamp-id="${outerClass}"`);
        expect(outerStart).toBeLessThan(innerStart);
    });
});
/**
 * The edge bands added by the placement-helpers work. Without them the
 * only way to drop BESIDE a container inside a flex parent was to hit the
 * gap between siblings — anywhere on its body nested you inside it, which
 * is the ambiguity the story is about.
 * see docs/archive/2026-08-13-drop-placement-helpers-plan.md
 */
test.describe('canvas: drop beside vs inside', () => {
    /** Drag an element's centre to a viewport point. */
    const dragElementToClient = async (window, className, to) => {
        const box = await canvasElement(window, className).boundingBox();
        if (!box)
            throw new Error(`no bounding box for ${className}`);
        await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await window.mouse.down();
        await window.mouse.move(to.x, to.y, { steps: 12 });
        await window.mouse.up();
    };
    /**
     * A flex-row container holding one child rect, plus a loose rect
     * outside it. Returns all three classes.
     */
    const seedFlexWithChild = async (window) => {
        await expect(pageRoot(window)).toBeVisible();
        const flex = await drawAndSelectRect(window, { x: 300, y: 100 }, { x: 660, y: 420 });
        await panelSection(window, 'Layout')
            .getByRole('radio', { name: 'Flex row' })
            .click();
        await waitForSaved(window);
        // Drawn inside the flex box, so it lands as its child.
        await selectTool(window, 'r');
        await dragInFrame(window, { x: 340, y: 160 }, { x: 520, y: 340 });
        await waitForSaved(window);
        const child = (await canvasElementsByPrefix(window, 'rect_').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-scamp-id') ?? ''))).find((c) => c !== flex);
        if (!child)
            throw new Error('expected a child rect inside the flex box');
        const loose = await drawAndSelectRect(window, { x: 60, y: 60 }, { x: 160, y: 160 });
        await waitForSaved(window);
        return { flex, child, loose };
    };
    test('dropping on a container\'s edge lands beside it, not inside it', async ({ window, project, }) => {
        const { flex, child, loose } = await seedFlexWithChild(window);
        const box = await canvasElement(window, child).boundingBox();
        if (!box)
            throw new Error('no box for the child');
        // A few px inside the child's left edge — its "before" band.
        await selectTool(window, 'v');
        await dragElementToClient(window, loose, {
            x: box.x + 4,
            y: box.y + box.height / 2,
        });
        await waitForSaved(window);
        const { tsx } = await readPageFiles(project.dir, project.pageName);
        // It joined the flex row alongside the child, rather than nesting in it.
        expectNestedInTsx(tsx, flex, loose);
        const childStart = tsx.indexOf(`data-scamp-id="${child}"`);
        const looseStart = tsx.indexOf(`data-scamp-id="${loose}"`);
        const childEnd = tsx.indexOf('</div>', childStart);
        expect(looseStart < childStart || looseStart > childEnd).toBe(true);
    });
    test('dropping on the same container\'s middle still lands inside it', async ({ window, project, }) => {
        // The contrast case — the middle must keep meaning "inside", or the
        // edge bands would just have broken nesting.
        const { child, loose } = await seedFlexWithChild(window);
        const box = await canvasElement(window, child).boundingBox();
        if (!box)
            throw new Error('no box for the child');
        await selectTool(window, 'v');
        await dragElementToClient(window, loose, {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
        });
        await waitForSaved(window);
        const { tsx } = await readPageFiles(project.dir, project.pageName);
        expectNestedInTsx(tsx, child, loose);
    });
    test('Escape mid-drag puts the element back and commits nothing', async ({ window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        const moved = await drawAndSelectRect(window, { x: 60, y: 60 }, { x: 160, y: 160 });
        await waitForSaved(window);
        const before = await canvasElement(window, moved).boundingBox();
        if (!before)
            throw new Error('no box before the drag');
        await selectTool(window, 'v');
        await window.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
        await window.mouse.down();
        await window.mouse.move(before.x + 260, before.y + 180, { steps: 10 });
        await window.keyboard.press('Escape');
        await window.mouse.up();
        await waitForSaved(window);
        const after = await canvasElement(window, moved).boundingBox();
        expect(after?.x).toBeCloseTo(before.x, 0);
        expect(after?.y).toBeCloseTo(before.y, 0);
        // And one undo returns to before the rect was DRAWN — the abandoned
        // drag left no entry of its own to step through first.
        await window.keyboard.press('ControlOrMeta+z');
        await expect(canvasElementsByPrefix(window, 'rect_')).toHaveCount(0);
    });
});
/**
 * Two things the first pass got wrong, reported from manual testing:
 * a flow drop drew a line but never said WHICH container the element
 * would join, and grid parents didn't get the edge-band treatment flex
 * parents did. see docs/archive/2026-08-13-drop-placement-helpers-plan.md
 */
test.describe('canvas: which container am I dropping into', () => {
    /** The mid-drag container outline. */
    const dropOutline = (window) => window.locator('[class*="dropContainer"]');
    /** A flow container (flex row or grid) holding one child rect. */
    const seedFlowWithChild = async (window, layout) => {
        await expect(pageRoot(window)).toBeVisible();
        const container = await drawAndSelectRect(window, { x: 300, y: 100 }, { x: 680, y: 440 });
        await panelSection(window, 'Layout')
            .getByRole('radio', { name: layout })
            .click();
        await waitForSaved(window);
        await selectTool(window, 'r');
        await dragInFrame(window, { x: 340, y: 160 }, { x: 540, y: 360 });
        await waitForSaved(window);
        const child = (await canvasElementsByPrefix(window, 'rect_').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-scamp-id') ?? ''))).find((c) => c !== container);
        if (!child)
            throw new Error('expected a child inside the container');
        const loose = await drawAndSelectRect(window, { x: 60, y: 60 }, { x: 160, y: 160 });
        await waitForSaved(window);
        return { container, child, loose };
    };
    test('highlights the container the element will land in, mid-drag', async ({ window, }) => {
        const { container, child, loose } = await seedFlowWithChild(window, 'Flex row');
        const childBox = await canvasElement(window, child).boundingBox();
        const containerBox = await canvasElement(window, container).boundingBox();
        if (!childBox || !containerBox)
            throw new Error('missing boxes');
        const looseBox = await canvasElement(window, loose).boundingBox();
        if (!looseBox)
            throw new Error('missing box for the dragged element');
        // Hold the drag over the child's leading edge — a "beside" drop, which
        // used to show a bare line with no clue which container it joined.
        await selectTool(window, 'v');
        await window.mouse.move(looseBox.x + looseBox.width / 2, looseBox.y + looseBox.height / 2);
        await window.mouse.down();
        await window.mouse.move(childBox.x + 4, childBox.y + childBox.height / 2, {
            steps: 10,
        });
        await expect(dropOutline(window)).toBeVisible();
        const outlineBox = await dropOutline(window).boundingBox();
        // The outline is over the flex container, not the child.
        expect(outlineBox?.width).toBeCloseTo(containerBox.width, 0);
        expect(outlineBox?.height).toBeCloseTo(containerBox.height, 0);
        await window.mouse.up();
    });
    test('a grid container gets the same edge bands as a flex one', async ({ window, project, }) => {
        const { container, child, loose } = await seedFlowWithChild(window, 'Grid');
        const childBox = await canvasElement(window, child).boundingBox();
        const looseBox = await canvasElement(window, loose).boundingBox();
        if (!childBox || !looseBox)
            throw new Error('missing boxes');
        // The child's leading edge: "beside it", inside the grid.
        await selectTool(window, 'v');
        await window.mouse.move(looseBox.x + looseBox.width / 2, looseBox.y + looseBox.height / 2);
        await window.mouse.down();
        await window.mouse.move(childBox.x + 4, childBox.y + childBox.height / 2, {
            steps: 10,
        });
        await expect(dropOutline(window)).toBeVisible();
        await window.mouse.up();
        await waitForSaved(window);
        const { tsx } = await readPageFiles(project.dir, project.pageName);
        expectNestedInTsx(tsx, container, loose);
        // Beside the child, not nested inside it.
        const childStart = tsx.indexOf(`data-scamp-id="${child}"`);
        const looseStart = tsx.indexOf(`data-scamp-id="${loose}"`);
        const childEnd = tsx.indexOf('</div>', childStart);
        expect(looseStart < childStart || looseStart > childEnd).toBe(true);
    });
    test('a grid container still nests when dropped dead centre', async ({ window, project, }) => {
        const { child, loose } = await seedFlowWithChild(window, 'Grid');
        const childBox = await canvasElement(window, child).boundingBox();
        const looseBox = await canvasElement(window, loose).boundingBox();
        if (!childBox || !looseBox)
            throw new Error('missing boxes');
        await selectTool(window, 'v');
        await window.mouse.move(looseBox.x + looseBox.width / 2, looseBox.y + looseBox.height / 2);
        await window.mouse.down();
        await window.mouse.move(childBox.x + childBox.width / 2, childBox.y + childBox.height / 2, { steps: 10 });
        await window.mouse.up();
        await waitForSaved(window);
        const { tsx } = await readPageFiles(project.dir, project.pageName);
        expectNestedInTsx(tsx, child, loose);
    });
});
/**
 * Reordering WITHIN a grid — reported from manual testing on a
 * `grid-template-columns: 1fr 1fr 1fr` container whose children are small
 * cells. Grid children never entered the reorder path at all, because the
 * drag/reorder decision asked `isFlexChild`; they fell through to the
 * absolute-move machine, where dragging did nothing visible and the only
 * feedback came from whichever sibling happened to be under the cursor.
 * see docs/archive/2026-08-13-drop-placement-helpers-plan.md
 */
test.describe('canvas: reordering inside a grid', () => {
    const dropOutline = (window) => window.locator('[class*="dropContainer"]');
    const dropLine = (window) => window.locator('[class*="dropIndicator"]');
    /** A 3-column grid holding three cells, returned in childIds order. */
    const seedGrid = async (window) => {
        await expect(pageRoot(window)).toBeVisible();
        const grid = await drawAndSelectRect(window, { x: 200, y: 100 }, { x: 620, y: 340 });
        const layout = panelSection(window, 'Layout');
        await layout.getByRole('radio', { name: 'Grid' }).click();
        await waitForSaved(window);
        for (let i = 0; i < 3; i += 1) {
            await selectTool(window, 'r');
            await dragInFrame(window, { x: 230 + i * 60, y: 130 }, { x: 280 + i * 60, y: 180 });
            await waitForSaved(window);
        }
        const cells = (await canvasElementsByPrefix(window, 'rect_').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-scamp-id') ?? ''))).filter((c) => c !== grid);
        if (cells.length !== 3) {
            throw new Error(`expected 3 grid cells, got ${cells.join()}`);
        }
        return { grid, cells };
    };
    /** childIds order of the grid, read back from the saved TSX. */
    const orderInTsx = (tsx, cells) => [...cells].sort((a, b) => tsx.indexOf(`data-scamp-id="${a}"`) - tsx.indexOf(`data-scamp-id="${b}"`));
    test('shows a line BETWEEN cells and outlines the grid, not the cell', async ({ window, }) => {
        const { grid, cells } = await seedGrid(window);
        const target = await canvasElement(window, cells[1]).boundingBox();
        const gridBox = await canvasElement(window, grid).boundingBox();
        const dragged = await canvasElement(window, cells[2]).boundingBox();
        if (!target || !gridBox || !dragged)
            throw new Error('missing boxes');
        await selectTool(window, 'v');
        await window.mouse.move(dragged.x + dragged.width / 2, dragged.y + dragged.height / 2);
        await window.mouse.down();
        // The middle cell's leading edge — "put it before this one".
        await window.mouse.move(target.x + 2, target.y + target.height / 2, {
            steps: 10,
        });
        await expect(dropLine(window)).toBeVisible();
        await expect(dropOutline(window)).toBeVisible();
        // The outline covers the GRID, not the small cell under the cursor.
        const outline = await dropOutline(window).boundingBox();
        expect(outline?.width).toBeCloseTo(gridBox.width, 0);
        await window.mouse.up();
    });
    test('actually reorders the cells rather than nesting one inside another', async ({ window, project, }) => {
        const { grid, cells } = await seedGrid(window);
        const before = orderInTsx((await readPageFiles(project.dir, project.pageName)).tsx, cells);
        const target = await canvasElement(window, before[0]).boundingBox();
        const dragged = await canvasElement(window, before[2]).boundingBox();
        if (!target || !dragged)
            throw new Error('missing boxes');
        // Drag the last cell to the leading edge of the first.
        await selectTool(window, 'v');
        await window.mouse.move(dragged.x + dragged.width / 2, dragged.y + dragged.height / 2);
        await window.mouse.down();
        await window.mouse.move(target.x + 2, target.y + target.height / 2, {
            steps: 12,
        });
        await window.mouse.up();
        await waitForSaved(window);
        const { tsx } = await readPageFiles(project.dir, project.pageName);
        // It moved to the front of the grid's children...
        expect(orderInTsx(tsx, cells)[0]).toBe(before[2]);
        // ...and every cell is still a direct child of the grid, not nested
        // inside a sibling.
        for (const cell of cells)
            expectNestedInTsx(tsx, grid, cell);
        const firstEnd = tsx.indexOf('</div>', tsx.indexOf(`data-scamp-id="${before[0]}"`));
        const movedStart = tsx.indexOf(`data-scamp-id="${before[2]}"`);
        expect(movedStart).toBeLessThan(firstEnd);
    });
});
/**
 * Selecting is not dragging.
 *
 * A plain click on a flex child entered the reorder state machine, and a
 * single jittered pointermove — routine on a Mac trackpad, rare with a
 * mouse, which is why this only showed up in the packaged app — was
 * enough to resolve a drop target that release then committed. Two
 * shapes, both silent and both destructive: the child jumped to the end
 * of its parent (the append fallback, because `flowIndicator` excludes
 * the dragged element from sibling scanning and so finds nothing under
 * the cursor), or it was lifted out of the parent entirely (the
 * container's trailing edge band retargeting the drop one level up).
 *
 * The mouse moves 1px here deliberately: enough to fire pointermove,
 * below the click slop that now gates both interactions.
 */
test.describe('canvas: a click is not a drag', () => {
    const orderInTsx = (tsx, ids) => [...ids].sort((a, b) => tsx.indexOf(`data-scamp-id="${a}"`) - tsx.indexOf(`data-scamp-id="${b}"`));
    /** A flex row owning three children, in a known order. */
    const seedFlexRow = async (window, project) => {
        await expect(pageRoot(window)).toBeVisible();
        const flex = await drawAndSelectRect(window, { x: 300, y: 100 }, { x: 660, y: 420 });
        // Drawn inside the box while it's still absolute, so creation order
        // is the child order once it becomes a flex row. The rect tool
        // reverts to select after each draw, so it's re-armed every time.
        for (const x of [320, 410, 500]) {
            await selectTool(window, 'r');
            await dragInFrame(window, { x, y: 140 }, { x: x + 70, y: 300 });
            await waitForSaved(window);
        }
        // Via the layers tree: the container's centre is covered by its own
        // children by now, so a canvas click would land on one of them.
        await layersRowByClass(window, flex).click();
        await panelSection(window, 'Layout')
            .getByRole('radio', { name: 'Flex row' })
            .click();
        await waitForSaved(window);
        const all = await canvasElementsByPrefix(window, 'rect_').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-scamp-id') ?? ''));
        const children = all.filter((id) => id !== flex);
        expect(children).toHaveLength(3);
        const { tsx } = await readPageFiles(project.dir, project.pageName);
        return { flex, children: orderInTsx(tsx, children) };
    };
    /** Press, twitch one pixel, release — a click as a trackpad delivers it. */
    const clickWithJitter = async (window, className) => {
        const box = await canvasElement(window, className).boundingBox();
        if (!box)
            throw new Error(`no bounding box for ${className}`);
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await window.mouse.move(x, y);
        await window.mouse.down();
        await window.mouse.move(x + 1, y + 1);
        await window.mouse.up();
    };
    test('clicking the first flex child leaves the sibling order alone', async ({ window, project, }) => {
        const { children } = await seedFlexRow(window, project);
        await selectTool(window, 'v');
        await clickWithJitter(window, children[0]);
        await waitForSaved(window);
        const { tsx } = await readPageFiles(project.dir, project.pageName);
        // Before the fix this read [second, third, first] — the append
        // fallback sent the clicked child to the end of the parent.
        expect(orderInTsx(tsx, children)).toEqual(children);
    });
    test('clicking the last flex child keeps it inside the parent', async ({ window, project, }) => {
        const { flex, children } = await seedFlexRow(window, project);
        await selectTool(window, 'v');
        await clickWithJitter(window, children[2]);
        await waitForSaved(window);
        const { tsx } = await readPageFiles(project.dir, project.pageName);
        // The trailing child sits in its container's trailing edge band, so
        // this is the click that used to escape the flex parent entirely.
        for (const child of children)
            expectNestedInTsx(tsx, flex, child);
        expect(orderInTsx(tsx, children)).toEqual(children);
    });
    test('a deliberate drag past the slop still reorders', async ({ window, project, }) => {
        const { children } = await seedFlexRow(window, project);
        const target = await canvasElement(window, children[0]).boundingBox();
        const dragged = await canvasElement(window, children[2]).boundingBox();
        if (!target || !dragged)
            throw new Error('missing boxes');
        // The gate must not have cost us the feature it protects.
        await selectTool(window, 'v');
        await window.mouse.move(dragged.x + dragged.width / 2, dragged.y + dragged.height / 2);
        await window.mouse.down();
        await window.mouse.move(target.x + 2, target.y + target.height / 2, {
            steps: 12,
        });
        await window.mouse.up();
        await waitForSaved(window);
        const { tsx } = await readPageFiles(project.dir, project.pageName);
        expect(orderInTsx(tsx, children)[0]).toBe(children[2]);
    });
});
