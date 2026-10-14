import { describe, it, expect } from 'vitest';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { slotDropCreatesCycle } from '@renderer/src/canvas/interactions/reparentDrop';
/**
 * Phase 4 (component slots): dropping a component-instance into another
 * instance's slot must be refused when — and only when — it would fold the
 * dragged component into the component currently being edited such that a
 * cycle forms. On a page (no active component) it's always allowed.
 * see docs/archive/2026-07-16-component-slots-plan.md
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
const absoluteDrop = (targetId, slotName) => ({
    kind: 'absolute',
    targetId,
    rect: { x: 0, y: 0, w: 100, h: 100 },
    x: 0,
    y: 0,
    ...(slotName !== undefined ? { slotName } : {}),
});
const instanceTree = (rootId, childInstanceName) => {
    if (!childInstanceName) {
        return {
            elements: { [rootId]: makeEl({ id: rootId, parentId: null }) },
            rootId,
        };
    }
    const childId = `${rootId}_child`;
    return {
        elements: {
            [rootId]: makeEl({ id: rootId, parentId: null, childIds: [childId] }),
            [childId]: makeEl({
                id: childId,
                type: 'component-instance',
                componentName: childInstanceName,
                parentId: rootId,
            }),
        },
        rootId,
    };
};
describe('slotDropCreatesCycle', () => {
    // A page with an instance of Card (the slot owner) and an instance of
    // Banner (being dragged into Card's slot).
    const pageElements = {
        [ROOT_ELEMENT_ID]: makeEl({
            id: ROOT_ELEMENT_ID,
            parentId: null,
            childIds: ['inst_card', 'inst_banner'],
        }),
        inst_card: makeEl({
            id: 'inst_card',
            type: 'component-instance',
            componentName: 'Card',
        }),
        inst_banner: makeEl({
            id: 'inst_banner',
            type: 'component-instance',
            componentName: 'Banner',
        }),
    };
    const componentTrees = {
        // Banner transitively uses Card (Banner → Card).
        Banner: instanceTree('banner_root', 'Card'),
        Card: instanceTree('card_root'),
    };
    it('allows dropping an instance into a slot while on a page (no active component)', () => {
        expect(slotDropCreatesCycle(absoluteDrop('inst_card', 'children'), 'inst_banner', pageElements, componentTrees, null)).toBe(false);
    });
    it('refuses when the dragged component transitively uses the edited component', () => {
        // Editing "Card": dropping Banner (which uses Card) into a slot folds
        // Banner into Card's definition → cycle.
        expect(slotDropCreatesCycle(absoluteDrop('inst_card', 'children'), 'inst_banner', pageElements, componentTrees, 'Card')).toBe(true);
    });
    it('refuses dropping a component instance into a slot of the same component', () => {
        expect(slotDropCreatesCycle(absoluteDrop('inst_card'), 'inst_banner', pageElements, 
        // Banner is being dropped while editing Banner itself.
        componentTrees, 'Banner')).toBe(true);
    });
    it('allows when the dragged component does not reference the edited one', () => {
        expect(slotDropCreatesCycle(absoluteDrop('inst_card', 'children'), 'inst_banner', pageElements, componentTrees, 'SomethingElse')).toBe(false);
    });
    it('ignores flow drops (only absolute drops target slots)', () => {
        const flowDrop = {
            kind: 'flow',
            targetId: 'inst_card',
            indicator: {
                rect: { x: 0, y: 0, w: 2, h: 10 },
                newIndex: 0,
                containerRect: null,
            },
        };
        expect(slotDropCreatesCycle(flowDrop, 'inst_banner', pageElements, componentTrees, 'Card')).toBe(false);
    });
    it('ignores drops whose target is not a component-instance', () => {
        const withRect = {
            ...pageElements,
            plain_rect: makeEl({ id: 'plain_rect' }),
        };
        expect(slotDropCreatesCycle(absoluteDrop('plain_rect'), 'inst_banner', withRect, componentTrees, 'Card')).toBe(false);
    });
    it('ignores a dragged element that is not a component-instance', () => {
        const withRect = {
            ...pageElements,
            plain_rect: makeEl({ id: 'plain_rect' }),
        };
        expect(slotDropCreatesCycle(absoluteDrop('inst_card', 'children'), 'plain_rect', withRect, componentTrees, 'Card')).toBe(false);
    });
});
