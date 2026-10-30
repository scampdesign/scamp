import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { resolveComponentDrop } from '@renderer/src/canvas/interactions/reparentDrop';
/**
 * Dragging a component out of the sidebar drops it into whatever container
 * is under the cursor, not always at the page root. This covers the target
 * resolution — which container wins, and where in it the instance lands.
 * see docs/notes/components-data-model.md
 */
const makeEl = (overrides) => ({
    ...DEFAULT_RECT_STYLES,
    type: 'rectangle',
    parentId: ROOT_ELEMENT_ID,
    childIds: [],
    x: 0,
    y: 0,
    customProperties: {},
    ...overrides,
});
/**
 * `flowIndicator` reads `document.elementsFromPoint` directly to find the
 * sibling under the cursor. Stub it with the ids the test wants "hit", in
 * paint order, as nodes carrying `dataset.elementId`.
 */
const stubElementsFromPoint = (ids) => {
    const nodes = ids.map((id) => {
        const node = Object.create(HTMLElement.prototype);
        Object.defineProperty(node, 'dataset', { value: { elementId: id } });
        Object.defineProperty(node, 'nodeType', { value: 1 });
        return node;
    });
    globalThis.document = {
        elementsFromPoint: () => nodes,
    };
};
class FakeHTMLElement {
}
globalThis.HTMLElement = FakeHTMLElement;
globalThis.SVGElement = class {
};
afterEach(() => {
    delete globalThis.document;
});
/** Geometry stub: every element is a 100×100 box at the origin unless the
 *  test says otherwise, and frame coords equal client coords. */
const makeGeometry = (rects, drop) => ({
    toFrame: (clientX, clientY) => ({ x: clientX, y: clientY }),
    measureElementInFrame: (id) => rects[id] ?? null,
    parentSizeOf: () => ({ w: 0, h: 0 }),
    parentMoveBoundsOf: () => ({ w: 0, h: 0 }),
    isFlexChild: () => false,
    isFlowChild: () => false,
    resolveDropContainer: () => drop,
});
describe('resolveComponentDrop — target container', () => {
    it('falls back to the page root when nothing is under the cursor', () => {
        stubElementsFromPoint([]);
        const elements = {
            [ROOT_ELEMENT_ID]: makeEl({ id: ROOT_ELEMENT_ID, parentId: null }),
        };
        const geometry = makeGeometry({ [ROOT_ELEMENT_ID]: { x: 0, y: 0, w: 1440, h: 900 } }, null);
        const result = resolveComponentDrop(10, 20, geometry, elements, ROOT_ELEMENT_ID);
        expect(result.targetId).toBe(ROOT_ELEMENT_ID);
    });
    it('targets the container under the cursor rather than the root', () => {
        stubElementsFromPoint([]);
        const elements = {
            [ROOT_ELEMENT_ID]: makeEl({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['card'] }),
            card: makeEl({ id: 'card' }),
        };
        const geometry = makeGeometry({ card: { x: 100, y: 100, w: 300, h: 200 } }, { parentId: 'card', isFlow: false });
        const result = resolveComponentDrop(150, 160, geometry, elements, ROOT_ELEMENT_ID);
        expect(result.targetId).toBe('card');
    });
    it('treats a flex root as a flow target even with no hit-tested container', () => {
        // The page root is below every element in paint order, so a drop on
        // root padding resolves nothing — but a flex root still owns layout.
        stubElementsFromPoint([]);
        const elements = {
            [ROOT_ELEMENT_ID]: makeEl({
                id: ROOT_ELEMENT_ID,
                parentId: null,
                display: 'flex',
                flexDirection: 'column',
                childIds: [],
            }),
        };
        const geometry = makeGeometry({ [ROOT_ELEMENT_ID]: { x: 0, y: 0, w: 1440, h: 900 } }, null);
        const result = resolveComponentDrop(10, 20, geometry, elements, ROOT_ELEMENT_ID);
        expect(result.kind).toBe('flow');
    });
});
describe('resolveComponentDrop — absolute targets', () => {
    const elements = {
        [ROOT_ELEMENT_ID]: makeEl({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['card'] }),
        card: makeEl({ id: 'card' }),
    };
    const geometry = () => makeGeometry({ card: { x: 100, y: 100, w: 300, h: 200 } }, {
        parentId: 'card',
        isFlow: false,
    });
    it('places the instance at the cursor in the container local space', () => {
        stubElementsFromPoint([]);
        const result = resolveComponentDrop(150, 160, geometry(), elements, ROOT_ELEMENT_ID);
        expect(result).toMatchObject({ kind: 'absolute', x: 50, y: 60 });
    });
    it('clamps a cursor above the container to the container origin', () => {
        stubElementsFromPoint([]);
        const result = resolveComponentDrop(20, 30, geometry(), elements, ROOT_ELEMENT_ID);
        expect(result).toMatchObject({ x: 0, y: 0 });
    });
    it('clamps a cursor past the container to its far edge', () => {
        stubElementsFromPoint([]);
        const result = resolveComponentDrop(9000, 9000, geometry(), elements, ROOT_ELEMENT_ID);
        expect(result).toMatchObject({ x: 300, y: 200 });
    });
    it('carries a named slot through so the drop fills that slot', () => {
        stubElementsFromPoint([]);
        const geo = makeGeometry({ card: { x: 0, y: 0, w: 300, h: 200 } }, {
            parentId: 'card',
            isFlow: false,
            slotName: 'left',
        });
        const result = resolveComponentDrop(10, 10, geo, elements, ROOT_ELEMENT_ID);
        expect(result).toMatchObject({ slotName: 'left' });
    });
    it('drops the implicit children slot name, which is never written out', () => {
        stubElementsFromPoint([]);
        const geo = makeGeometry({ card: { x: 0, y: 0, w: 300, h: 200 } }, {
            parentId: 'card',
            isFlow: false,
            slotName: 'children',
        });
        const result = resolveComponentDrop(10, 10, geo, elements, ROOT_ELEMENT_ID);
        expect(result).not.toHaveProperty('slotName');
    });
});
describe('resolveComponentDrop — flow targets', () => {
    const rowElements = {
        [ROOT_ELEMENT_ID]: makeEl({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['row'] }),
        row: makeEl({
            id: 'row',
            display: 'flex',
            flexDirection: 'row',
            childIds: ['a', 'b'],
        }),
        a: makeEl({ id: 'a', parentId: 'row' }),
        b: makeEl({ id: 'b', parentId: 'row' }),
    };
    const rowGeometry = () => makeGeometry({
        row: { x: 0, y: 0, w: 400, h: 100 },
        a: { x: 0, y: 0, w: 200, h: 100 },
        b: { x: 200, y: 0, w: 200, h: 100 },
    }, { parentId: 'row', isFlow: true });
    it('inserts before a sibling when the cursor is left of its centre', () => {
        stubElementsFromPoint(['b']);
        const result = resolveComponentDrop(250, 50, rowGeometry(), rowElements, ROOT_ELEMENT_ID);
        expect(result).toMatchObject({ kind: 'flow', targetId: 'row' });
        expect(result.kind === 'flow' && result.indicator.newIndex).toBe(1);
    });
    it('inserts after a sibling when the cursor is right of its centre', () => {
        stubElementsFromPoint(['b']);
        const result = resolveComponentDrop(350, 50, rowGeometry(), rowElements, ROOT_ELEMENT_ID);
        expect(result.kind === 'flow' && result.indicator.newIndex).toBe(2);
    });
    it('appends when the cursor is over container padding, not a sibling', () => {
        stubElementsFromPoint([]);
        const result = resolveComponentDrop(390, 50, rowGeometry(), rowElements, ROOT_ELEMENT_ID);
        expect(result.kind === 'flow' && result.indicator.newIndex).toBe(2);
    });
    it('appends into an empty flex container', () => {
        stubElementsFromPoint([]);
        const elements = {
            [ROOT_ELEMENT_ID]: makeEl({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['row'] }),
            row: makeEl({ id: 'row', display: 'flex', flexDirection: 'row', childIds: [] }),
        };
        const geo = makeGeometry({ row: { x: 0, y: 0, w: 400, h: 100 } }, {
            parentId: 'row',
            isFlow: true,
        });
        const result = resolveComponentDrop(200, 50, geo, elements, ROOT_ELEMENT_ID);
        expect(result.kind === 'flow' && result.indicator.newIndex).toBe(0);
    });
    it('falls back to an absolute drop when the flow target cannot be measured', () => {
        stubElementsFromPoint([]);
        const geo = makeGeometry({}, { parentId: 'row', isFlow: true });
        const result = resolveComponentDrop(10, 10, geo, rowElements, ROOT_ELEMENT_ID);
        expect(result.kind).toBe('absolute');
    });
});
