import { describe, it, expect } from 'vitest';
import { cloneElementSubtree, ROOT_ELEMENT_ID } from '@lib/element';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { classNameFor } from '@lib/generateCode';
const makeRect = (overrides) => ({
    ...DEFAULT_RECT_STYLES,
    type: 'rectangle',
    parentId: ROOT_ELEMENT_ID,
    childIds: [],
    x: 0,
    y: 0,
    customProperties: {},
    ...overrides,
});
const makeRoot = (childIds = []) => ({
    id: ROOT_ELEMENT_ID,
    type: 'rectangle',
    parentId: null,
    childIds,
    widthMode: 'fixed',
    widthValue: 1440,
    heightMode: 'fixed',
    heightValue: 900,
    x: 0,
    y: 0,
    display: 'none',
    flexDirection: 'row',
    gap: 0,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gridTemplateColumns: '',
    gridTemplateRows: '',
    columnGap: 0,
    rowGap: 0,
    justifyItems: 'stretch',
    flexWrap: 'nowrap',
    alignContent: 'normal',
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: '',
    order: 0,
    gridColumn: '',
    gridRow: '',
    alignSelf: 'auto',
    justifySelf: 'stretch',
    padding: [0, 0, 0, 0],
    margin: [0, 0, 0, 0],
    backgroundColor: '#ffffff',
    borderRadius: [0, 0, 0, 0],
    borderWidth: [0, 0, 0, 0],
    borderStyle: 'none',
    borderColor: '#000000',
    opacity: 1,
    visibilityMode: 'visible',
    position: 'auto',
    mixBlendMode: 'normal',
    backgroundBlendMode: 'normal',
    boxShadows: [],
    filters: [],
    backdropFilters: [],
    transforms: [],
    transformOrigin: '',
    toggledOffGroups: [],
    transitions: [],
    inlineFragments: [],
    customProperties: {},
});
const seq = (ids) => {
    let i = 0;
    return () => ids[i++] ?? `extra${i}`;
};
describe('cloneElementSubtree', () => {
    it('clones a single rect with a fresh id under the same parent', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
            a1b2: makeRect({
                id: 'a1b2',
                x: 100,
                y: 50,
                widthValue: 200,
                heightValue: 200,
                backgroundColor: '#3b82f6',
            }),
        };
        const result = cloneElementSubtree(elements, 'a1b2', ROOT_ELEMENT_ID, new Set(['root', 'a1b2']), seq(['c0c0']));
        expect(result).not.toBeNull();
        expect(result.newId).toBe('c0c0');
        expect(result.cloned).toEqual({
            c0c0: {
                ...elements['a1b2'],
                id: 'c0c0',
                parentId: ROOT_ELEMENT_ID,
                childIds: [],
            },
        });
    });
    it('clones a nested subtree with fresh ids for every descendant', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
            a1b2: makeRect({
                id: 'a1b2',
                widthValue: 400,
                heightValue: 400,
                childIds: ['c3d4', 'e5f6'],
            }),
            c3d4: makeRect({ id: 'c3d4', parentId: 'a1b2', x: 10, y: 10 }),
            e5f6: makeRect({ id: 'e5f6', parentId: 'a1b2', x: 200, y: 200 }),
        };
        const result = cloneElementSubtree(elements, 'a1b2', ROOT_ELEMENT_ID, new Set(['root', 'a1b2', 'c3d4', 'e5f6']), seq(['n001', 'n002', 'n003']));
        expect(result).not.toBeNull();
        const { newId, cloned } = result;
        expect(newId).toBe('n001');
        expect(Object.keys(cloned).sort()).toEqual(['n001', 'n002', 'n003']);
        expect(cloned['n001']?.childIds).toEqual(['n002', 'n003']);
        expect(cloned['n002']?.parentId).toBe('n001');
        expect(cloned['n003']?.parentId).toBe('n001');
        expect(cloned['n002']?.x).toBe(10);
        expect(cloned['n003']?.x).toBe(200);
    });
    it('produces deep copies of customProperties and padding', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
            a1b2: makeRect({
                id: 'a1b2',
                padding: [4, 8, 12, 16],
                customProperties: { 'box-shadow': '0 1px 2px black' },
            }),
        };
        const result = cloneElementSubtree(elements, 'a1b2', ROOT_ELEMENT_ID, new Set(['root', 'a1b2']), seq(['c0c0']));
        const clone = result.cloned['c0c0'];
        // The cloned tuple must be a fresh array (different reference)
        // so swapping it on the clone can't affect the original — the
        // tuple itself is readonly in the type system, but cloneElement
        // still needs to give callers a distinct array. We verify
        // identity, then mutate the clone's customProperties (which IS
        // mutable) to confirm independence end-to-end.
        expect(clone.padding).not.toBe(elements['a1b2'].padding);
        clone.customProperties['transform'] = 'rotate(2deg)';
        expect(elements['a1b2'].padding[0]).toBe(4);
        expect(elements['a1b2'].customProperties['transform']).toBeUndefined();
    });
    it('regenerates colliding ids', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
            a1b2: makeRect({ id: 'a1b2' }),
            taken: makeRect({ id: 'taken' }),
        };
        const result = cloneElementSubtree(elements, 'a1b2', ROOT_ELEMENT_ID, new Set(['root', 'a1b2', 'taken', 'first']), seq(['first', 'second']));
        expect(result.newId).toBe('second');
    });
    it('returns null when the source element does not exist', () => {
        const result = cloneElementSubtree({ [ROOT_ELEMENT_ID]: makeRoot() }, 'missing', ROOT_ELEMENT_ID, new Set(['root']), seq(['x']));
        expect(result).toBeNull();
    });
});
/**
 * A duplicate keeps the user's name and only regenerates the id suffix,
 * so `menu_a1b2` duplicates to `menu_c3d4` rather than reverting to
 * `rect_c3d4`. see docs/archive/2026-08-11-duplicate-preserves-names-plan.md
 */
describe('cloneElementSubtree: names', () => {
    it('keeps the name on the clone while giving it a fresh id', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
            a1b2: makeRect({ id: 'a1b2', name: 'menu' }),
        };
        const result = cloneElementSubtree(elements, 'a1b2', ROOT_ELEMENT_ID, new Set(['root', 'a1b2']), seq(['c3d4']));
        const clone = result.cloned['c3d4'];
        expect(clone.name).toBe('menu');
        expect(clone.id).toBe('c3d4');
    });
    it('gives the clone a menu_ class, not the default rect_ prefix', () => {
        // The name only matters because it drives the class name — this is
        // the assertion the story is actually about.
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
            a1b2: makeRect({ id: 'a1b2', name: 'menu' }),
        };
        const result = cloneElementSubtree(elements, 'a1b2', ROOT_ELEMENT_ID, new Set(['root', 'a1b2']), seq(['c3d4']));
        expect(classNameFor(result.cloned['c3d4'])).toBe('menu_c3d4');
        expect(classNameFor(result.cloned['c3d4'])).not.toBe(classNameFor(elements['a1b2']));
    });
    it('keeps names on named descendants, and leaves unnamed ones unnamed', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
            a1b2: makeRect({ id: 'a1b2', name: 'menu', childIds: ['c3d4', 'e5f6'] }),
            c3d4: makeRect({ id: 'c3d4', parentId: 'a1b2', name: 'menu_item' }),
            e5f6: makeRect({ id: 'e5f6', parentId: 'a1b2' }),
        };
        const result = cloneElementSubtree(elements, 'a1b2', ROOT_ELEMENT_ID, new Set(['root', 'a1b2', 'c3d4', 'e5f6']), seq(['n001', 'n002', 'n003']));
        const { cloned } = result;
        expect(cloned['n001']?.name).toBe('menu');
        expect(cloned['n002']?.name).toBe('menu_item');
        expect(classNameFor(cloned['n002'])).toBe('menu_item_n002');
        // An unnamed child must not inherit or invent a name.
        expect(cloned['n003']?.name).toBeUndefined();
        expect(classNameFor(cloned['n003'])).toBe('rect_n003');
    });
    it('leaves an unnamed element unnamed', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
            a1b2: makeRect({ id: 'a1b2' }),
        };
        const result = cloneElementSubtree(elements, 'a1b2', ROOT_ELEMENT_ID, new Set(['root', 'a1b2']), seq(['c3d4']));
        expect(result.cloned['c3d4']?.name).toBeUndefined();
        expect(classNameFor(result.cloned['c3d4'])).toBe('rect_c3d4');
    });
    it('gives every repeated duplicate the same name and a distinct class', () => {
        // Duplicating the same original twice, as Cmd+D twice would: both
        // clones are "menu", and all three classes are distinct.
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
            a1b2: makeRect({ id: 'a1b2', name: 'menu' }),
        };
        const first = cloneElementSubtree(elements, 'a1b2', ROOT_ELEMENT_ID, new Set(['root', 'a1b2']), seq(['c3d4']));
        const second = cloneElementSubtree(elements, 'a1b2', ROOT_ELEMENT_ID, new Set(['root', 'a1b2', 'c3d4']), seq(['e5f6']));
        expect(first.cloned['c3d4']?.name).toBe('menu');
        expect(second.cloned['e5f6']?.name).toBe('menu');
        const classes = [
            classNameFor(elements['a1b2']),
            classNameFor(first.cloned['c3d4']),
            classNameFor(second.cloned['e5f6']),
        ];
        expect(classes).toEqual(['menu_a1b2', 'menu_c3d4', 'menu_e5f6']);
        expect(new Set(classes).size).toBe(3);
    });
    it('keeps the name on a component instance while still refreshing its instanceId', () => {
        // An instance's class comes from instanceId, not the name — so this
        // guards that keeping the name didn't disturb the instance branch.
        const elements = {
            [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
            a1b2: makeRect({
                id: 'a1b2',
                type: 'component-instance',
                name: 'menu',
                componentName: 'Menu',
                instanceId: 'inst_a1b2',
                propOverrides: { label: 'Home' },
            }),
        };
        const result = cloneElementSubtree(elements, 'a1b2', ROOT_ELEMENT_ID, new Set(['root', 'a1b2']), seq(['c3d4', 'e5f6']));
        const clone = result.cloned['c3d4'];
        expect(clone.name).toBe('menu');
        expect(clone.instanceId).toBe('inst_e5f6');
        expect(classNameFor(clone)).toBe('inst_e5f6');
    });
});
