import { describe, expect, it } from 'vitest';

import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import {
  ROOT_ELEMENT_ID,
  type InlineFragment,
  type ScampElement,
} from '@lib/element';
import {
  ancestorIds,
  descendantIds,
  flattenTree,
  hasChildRows,
  hasCollapsedAncestor,
} from '@lib/treeRows';

/**
 * What the layers tree shows for a given collapse state. Pure, so the
 * awkward cases — nesting, cycles, inline fragments — are checked here
 * rather than through the UI.
 * see docs/archive/2026-08-11-tree-collapse-plan.md
 */

const el = (overrides: Partial<ScampElement> & { id: string }): ScampElement => ({
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
 *         leaf
 *     sibling
 */
const tree = (): Record<string, ScampElement> => ({
  [ROOT_ELEMENT_ID]: el({
    id: ROOT_ELEMENT_ID,
    parentId: null,
    childIds: ['outer', 'sibling'],
  }),
  outer: el({ id: 'outer', childIds: ['inner'] }),
  inner: el({ id: 'inner', parentId: 'outer', childIds: ['leaf'] }),
  leaf: el({ id: 'leaf', parentId: 'inner' }),
  sibling: el({ id: 'sibling' }),
});

/** A loose text fragment, the shape the parser produces for stray text. */
const fragment = (value: string): InlineFragment => ({
  kind: 'text',
  value,
  afterChildIndex: 0,
});

const idsOf = (rows: ReturnType<typeof flattenTree>): string[] =>
  rows.map((r) => (r.kind === 'element' ? r.element.id : `raw:${r.parentId}`));

describe('flattenTree', () => {
  it('walks depth-first when nothing is collapsed', () => {
    expect(idsOf(flattenTree(tree(), ROOT_ELEMENT_ID))).toEqual([
      ROOT_ELEMENT_ID,
      'outer',
      'inner',
      'leaf',
      'sibling',
    ]);
  });

  it('hides a collapsed element descendants but keeps the element', () => {
    expect(
      idsOf(flattenTree(tree(), ROOT_ELEMENT_ID, { outer: true }))
    ).toEqual([ROOT_ELEMENT_ID, 'outer', 'sibling']);
  });

  it('leaves siblings of a collapsed element alone', () => {
    const rows = idsOf(flattenTree(tree(), ROOT_ELEMENT_ID, { outer: true }));
    expect(rows).toContain('sibling');
  });

  it('does not shift depths when a branch collapses', () => {
    // Indentation must stay put — a row jumping left as its neighbour
    // collapses would read as the tree restructuring itself.
    const open = flattenTree(tree(), ROOT_ELEMENT_ID);
    const shut = flattenTree(tree(), ROOT_ELEMENT_ID, { outer: true });
    const depthOf = (rows: typeof open, id: string): number | undefined =>
      rows.find((r) => r.kind === 'element' && r.element.id === id)?.depth;
    expect(depthOf(shut, 'sibling')).toBe(depthOf(open, 'sibling'));
    expect(depthOf(shut, 'outer')).toBe(depthOf(open, 'outer'));
  });

  it('remembers an inner collapse while the outer one is shut', () => {
    // Collapsing `outer` hides `inner` entirely; re-expanding `outer` must
    // restore `inner` still collapsed, not helpfully opened.
    const collapsed = { outer: true, inner: true };
    expect(idsOf(flattenTree(tree(), ROOT_ELEMENT_ID, collapsed))).toEqual([
      ROOT_ELEMENT_ID,
      'outer',
      'sibling',
    ]);
    const reopened = { inner: true };
    expect(idsOf(flattenTree(tree(), ROOT_ELEMENT_ID, reopened))).toEqual([
      ROOT_ELEMENT_ID,
      'outer',
      'inner',
      'sibling',
    ]);
  });

  it('emits a raw row for inline fragments, after the children', () => {
    const elements = {
      ...tree(),
      outer: el({
        id: 'outer',
        childIds: ['inner'],
        inlineFragments: [fragment('some text')],
      }),
    };
    expect(idsOf(flattenTree(elements, ROOT_ELEMENT_ID))).toEqual([
      ROOT_ELEMENT_ID,
      'outer',
      'inner',
      'leaf',
      'raw:outer',
      'sibling',
    ]);
  });

  it('hides the raw row when its element is collapsed', () => {
    const elements = {
      ...tree(),
      outer: el({
        id: 'outer',
        childIds: [],
        inlineFragments: [fragment('some text')],
      }),
    };
    expect(
      idsOf(flattenTree(elements, ROOT_ELEMENT_ID, { outer: true }))
    ).toEqual([ROOT_ELEMENT_ID, 'outer', 'sibling']);
  });

  it('renders each element once when the tree references one twice', () => {
    const elements = {
      ...tree(),
      [ROOT_ELEMENT_ID]: el({
        id: ROOT_ELEMENT_ID,
        parentId: null,
        childIds: ['outer', 'outer'],
      }),
    };
    const rows = idsOf(flattenTree(elements, ROOT_ELEMENT_ID));
    expect(rows.filter((r) => r === 'outer')).toHaveLength(1);
  });

  it('terminates on a cycle', () => {
    const elements: Record<string, ScampElement> = {
      [ROOT_ELEMENT_ID]: el({ id: ROOT_ELEMENT_ID, parentId: null, childIds: ['a'] }),
      a: el({ id: 'a', childIds: ['b'] }),
      b: el({ id: 'b', parentId: 'a', childIds: ['a'] }),
    };
    expect(() => flattenTree(elements, ROOT_ELEMENT_ID)).not.toThrow();
  });

  it('returns nothing when the root is missing', () => {
    expect(flattenTree({}, ROOT_ELEMENT_ID)).toEqual([]);
  });

  it('skips a child id that no longer resolves', () => {
    const elements = {
      ...tree(),
      outer: el({ id: 'outer', childIds: ['inner', 'ghost'] }),
    };
    expect(idsOf(flattenTree(elements, ROOT_ELEMENT_ID))).not.toContain('ghost');
  });
});

describe('hasChildRows', () => {
  it('is true for an element with children', () => {
    expect(hasChildRows(el({ id: 'x', childIds: ['y'] }))).toBe(true);
  });

  it('is true for an element with only inline fragments', () => {
    // It still has a row to hide, so it still needs a triangle.
    expect(hasChildRows(el({ id: 'x', inlineFragments: [fragment('hi')] }))).toBe(
      true
    );
  });

  it('is false for a leaf', () => {
    expect(hasChildRows(el({ id: 'x' }))).toBe(false);
  });
});

describe('descendantIds', () => {
  it('returns the whole subtree, excluding the element itself', () => {
    expect(descendantIds(tree(), 'outer')).toEqual(['inner', 'leaf']);
  });

  it('is empty for a leaf', () => {
    expect(descendantIds(tree(), 'leaf')).toEqual([]);
  });

  it('is empty for an unknown id', () => {
    expect(descendantIds(tree(), 'nope')).toEqual([]);
  });

  it('terminates on a cycle', () => {
    const elements: Record<string, ScampElement> = {
      a: el({ id: 'a', childIds: ['b'] }),
      b: el({ id: 'b', parentId: 'a', childIds: ['a'] }),
    };
    expect(descendantIds(elements, 'a')).toEqual(['b']);
  });
});

describe('ancestorIds', () => {
  it('returns ancestors nearest-first', () => {
    expect(ancestorIds(tree(), 'leaf')).toEqual(['inner', 'outer', ROOT_ELEMENT_ID]);
  });

  it('is empty for the root', () => {
    expect(ancestorIds(tree(), ROOT_ELEMENT_ID)).toEqual([]);
  });

  it('is empty for an unknown id', () => {
    expect(ancestorIds(tree(), 'nope')).toEqual([]);
  });

  it('terminates when a parent chain loops', () => {
    const elements: Record<string, ScampElement> = {
      a: el({ id: 'a', parentId: 'b' }),
      b: el({ id: 'b', parentId: 'a' }),
    };
    expect(() => ancestorIds(elements, 'a')).not.toThrow();
  });
});

describe('hasCollapsedAncestor', () => {
  it('is true when an ancestor is collapsed', () => {
    expect(hasCollapsedAncestor(tree(), 'leaf', { outer: true })).toBe(true);
  });

  it('is false when only the element itself is collapsed', () => {
    // A collapsed element is still visible — it's its contents that hide.
    expect(hasCollapsedAncestor(tree(), 'outer', { outer: true })).toBe(false);
  });

  it('is false when nothing is collapsed', () => {
    expect(hasCollapsedAncestor(tree(), 'leaf', {})).toBe(false);
  });
});
