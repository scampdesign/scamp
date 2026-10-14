import { describe, expect, it } from 'vitest';
import { normalizeCopySelection } from '@lib/clipboardSelection';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID } from '@lib/element';
/**
 * Which subtrees a copy or cut acts on, given a raw selection.
 * see docs/archive/2026-08-12-copy-cut-paste-plan.md
 */
const el = (overrides) => ({
    ...DEFAULT_RECT_STYLES,
    type: 'rectangle',
    parentId: ROOT_ELEMENT_ID,
    childIds: [],
    inlineFragments: [],
    x: 0,
    y: 0,
    customProperties: {},
    ...overrides,
});
/**
 *   root
 *     outer
 *       inner
 *     sibling
 */
const tree = () => ({
    [ROOT_ELEMENT_ID]: el({
        id: ROOT_ELEMENT_ID,
        parentId: null,
        childIds: ['outer', 'sibling'],
    }),
    outer: el({ id: 'outer', childIds: ['inner'] }),
    inner: el({ id: 'inner', parentId: 'outer' }),
    sibling: el({ id: 'sibling' }),
});
const normalize = (ids, elements = tree()) => normalizeCopySelection(elements, ids, ROOT_ELEMENT_ID);
describe('normalizeCopySelection', () => {
    it('returns a single selected element unchanged', () => {
        expect(normalize(['outer'])).toEqual(['outer']);
    });
    it('returns nothing for an empty selection', () => {
        expect(normalize([])).toEqual([]);
    });
    it('drops ids that are not in the element map', () => {
        expect(normalize(['outer', 'ghost'])).toEqual(['outer']);
    });
});
describe('normalizeCopySelection: the page root', () => {
    it('expands the root to its children rather than copying the frame', () => {
        expect(normalize([ROOT_ELEMENT_ID])).toEqual(['outer', 'sibling']);
    });
    it('returns nothing when the root has no children', () => {
        // The caller treats this as "leave the clipboard alone", which is why
        // it must be empty rather than `[root]`.
        const empty = { [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null }) };
        expect(normalizeCopySelection(empty, [ROOT_ELEMENT_ID], ROOT_ELEMENT_ID)).toEqual([]);
    });
    it('does not double up when the root and one of its children are both selected', () => {
        expect(normalize([ROOT_ELEMENT_ID, 'outer'])).toEqual(['outer', 'sibling']);
    });
});
describe('normalizeCopySelection: nested selections', () => {
    it('drops a child when its parent is also selected', () => {
        // Copying both would capture `inner` twice and paste it twice.
        expect(normalize(['outer', 'inner'])).toEqual(['outer']);
    });
    it('drops a deep descendant, not just a direct child', () => {
        const elements = tree();
        elements['inner'] = el({ id: 'inner', parentId: 'outer', childIds: ['deep'] });
        elements['deep'] = el({ id: 'deep', parentId: 'inner' });
        expect(normalize(['outer', 'deep'], elements)).toEqual(['outer']);
    });
    it('keeps both when neither contains the other', () => {
        expect(normalize(['inner', 'sibling'])).toEqual(['inner', 'sibling']);
    });
});
describe('normalizeCopySelection: ordering', () => {
    it('returns document order regardless of the order ids were selected in', () => {
        expect(normalize(['sibling', 'outer'])).toEqual(['outer', 'sibling']);
    });
    it('de-duplicates a repeated id', () => {
        expect(normalize(['outer', 'outer'])).toEqual(['outer']);
    });
    it('still returns an element that is unreachable from the root', () => {
        // A malformed tree shouldn't silently drop what the user selected.
        const elements = tree();
        elements['orphan'] = el({ id: 'orphan', parentId: 'gone' });
        expect(normalize(['orphan'], elements)).toEqual(['orphan']);
    });
});
describe('normalizeCopySelection: malformed trees', () => {
    it('terminates when the parent chain loops', () => {
        const elements = {
            [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['a'] }),
            a: el({ id: 'a', parentId: 'b', childIds: ['b'] }),
            b: el({ id: 'b', parentId: 'a', childIds: ['a'] }),
        };
        expect(() => normalizeCopySelection(elements, ['a', 'b'], ROOT_ELEMENT_ID)).not.toThrow();
    });
    it('emits each element once when the tree references one twice', () => {
        const elements = tree();
        elements[ROOT_ELEMENT_ID] = el({
            id: ROOT_ELEMENT_ID,
            parentId: null,
            childIds: ['outer', 'outer'],
        });
        expect(normalizeCopySelection(elements, [ROOT_ELEMENT_ID], ROOT_ELEMENT_ID)).toEqual(['outer']);
    });
});
