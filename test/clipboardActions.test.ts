import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasStore } from '@store/canvasSlice';
import { useHistoryStore } from '@store/historySlice';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID, type ScampElement } from '@lib/element';

/**
 * Copy / cut / paste at the store level. `clipboardSelection.test.ts`
 * covers which subtrees a selection resolves to; this covers what the
 * actions then do with them — where a paste lands, what cut removes, and
 * how many undo steps each takes.
 * see docs/archive/2026-08-12-copy-cut-paste-plan.md
 */

/** History is bucketed per page; the actions key off `activePageId`. */
const HISTORY_PAGE = '/p/home.tsx';

const makePageRoot = (childIds: string[] = []): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  id: ROOT_ELEMENT_ID,
  type: 'rectangle',
  parentId: null,
  childIds,
  widthMode: 'stretch',
  heightMode: 'auto',
  x: 0,
  y: 0,
  customProperties: {},
});

const makeRect = (
  overrides: Partial<ScampElement> & { id: string }
): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  type: 'rectangle',
  parentId: ROOT_ELEMENT_ID,
  childIds: [],
  x: 0,
  y: 0,
  customProperties: {},
  ...overrides,
});

const makeText = (
  overrides: Partial<ScampElement> & { id: string }
): ScampElement => ({
  ...makeRect(overrides),
  type: 'text',
  text: 'hello',
});

const seed = (elements: Record<string, ScampElement>): void => {
  useCanvasStore.setState({
    elements,
    rootElementId: ROOT_ELEMENT_ID,
    selectedElementIds: [],
    clipboard: null,
    activePage: { name: 'home', tsxPath: '/p/home.tsx', cssPath: '/p/home.css' },
    activeComponent: null,
  });
  useHistoryStore.setState({
    perPage: { [HISTORY_PAGE]: { entries: [], cursor: -1 } },
    activePageId: HISTORY_PAGE,
    transactionDepth: 0,
  });
};

/** Entries recorded for the seeded page. */
const historyLength = (): number =>
  useHistoryStore.getState().perPage[HISTORY_PAGE]?.entries.length ?? 0;

/** The store's elements, minus the root — i.e. what's on the page. */
const pageChildren = (): ScampElement[] => {
  const state = useCanvasStore.getState();
  const root = state.elements[ROOT_ELEMENT_ID];
  return (root?.childIds ?? []).flatMap((id) => {
    const el = state.elements[id];
    return el ? [el] : [];
  });
};

describe('pasteElement: where it lands', () => {
  beforeEach(() => {
    seed({
      [ROOT_ELEMENT_ID]: makePageRoot(['box', 'label']),
      box: makeRect({ id: 'box', x: 10, y: 20 }),
      label: makeText({ id: 'label' }),
    });
  });

  it('pastes into the selected element when it can hold children', () => {
    useCanvasStore.getState().copyElements(['box']);
    useCanvasStore.setState({ selectedElementIds: ['box'] });
    const [newId] = useCanvasStore.getState().pasteElement();

    expect(newId).toBeDefined();
    expect(useCanvasStore.getState().elements[newId!]?.parentId).toBe('box');
  });

  it('pastes ALONGSIDE a text element, never inside it', () => {
    // The regression: a text element can't hold children, so pasting into
    // one emits invalid nesting straight to disk.
    useCanvasStore.getState().copyElements(['box']);
    useCanvasStore.setState({ selectedElementIds: ['label'] });
    const [newId] = useCanvasStore.getState().pasteElement();

    expect(useCanvasStore.getState().elements[newId!]?.parentId).toBe(
      ROOT_ELEMENT_ID
    );
    expect(useCanvasStore.getState().elements['label']?.childIds).toEqual([]);
  });

  it('pastes into the root when nothing is selected', () => {
    useCanvasStore.getState().copyElements(['box']);
    useCanvasStore.setState({ selectedElementIds: [] });
    const [newId] = useCanvasStore.getState().pasteElement();

    expect(useCanvasStore.getState().elements[newId!]?.parentId).toBe(
      ROOT_ELEMENT_ID
    );
  });

  it('does nothing when the clipboard is empty', () => {
    expect(useCanvasStore.getState().pasteElement()).toEqual([]);
    expect(pageChildren()).toHaveLength(2);
  });

  it('selects what it pasted', () => {
    useCanvasStore.getState().copyElements(['box']);
    const created = useCanvasStore.getState().pasteElement();
    expect(useCanvasStore.getState().selectedElementIds).toEqual(created);
  });
});

describe('pasteElement: positioning', () => {
  beforeEach(() => {
    seed({
      [ROOT_ELEMENT_ID]: makePageRoot(['box']),
      box: makeRect({ id: 'box', x: 10, y: 20 }),
    });
  });

  it('offsets an ordinary paste so it does not hide under the original', () => {
    useCanvasStore.getState().copyElements(['box']);
    const [newId] = useCanvasStore.getState().pasteElement();
    const pasted = useCanvasStore.getState().elements[newId!];
    expect(pasted?.x).toBe(30);
    expect(pasted?.y).toBe(40);
  });

  it('keeps the copied coordinates when pasting in place', () => {
    useCanvasStore.getState().copyElements(['box']);
    const [newId] = useCanvasStore.getState().pasteElement({ inPlace: true });
    const pasted = useCanvasStore.getState().elements[newId!];
    expect(pasted?.x).toBe(10);
    expect(pasted?.y).toBe(20);
  });

  it('drops the paste at an explicit point', () => {
    useCanvasStore.getState().copyElements(['box']);
    const [newId] = useCanvasStore
      .getState()
      .pasteElement({ at: { x: 200, y: 300 } });
    const pasted = useCanvasStore.getState().elements[newId!];
    expect(pasted?.x).toBe(200);
    expect(pasted?.y).toBe(300);
  });

  it('leaves x/y alone inside a flex parent, where layout owns position', () => {
    useCanvasStore.setState({
      elements: {
        ...useCanvasStore.getState().elements,
        [ROOT_ELEMENT_ID]: {
          ...makePageRoot(['box']),
          display: 'flex',
        },
      },
    });
    useCanvasStore.getState().copyElements(['box']);
    const [newId] = useCanvasStore.getState().pasteElement();
    const pasted = useCanvasStore.getState().elements[newId!];
    expect(pasted?.x).toBe(10);
    expect(pasted?.y).toBe(20);
  });
});

describe('copyElements: multiple and nested', () => {
  beforeEach(() => {
    seed({
      [ROOT_ELEMENT_ID]: makePageRoot(['a', 'b']),
      a: makeRect({ id: 'a', childIds: ['a1'] }),
      a1: makeRect({ id: 'a1', parentId: 'a' }),
      b: makeRect({ id: 'b' }),
    });
  });

  it('round-trips two subtrees, each with fresh ids', () => {
    useCanvasStore.getState().copyElements(['a', 'b']);
    const created = useCanvasStore.getState().pasteElement();

    expect(created).toHaveLength(2);
    expect(created).not.toContain('a');
    expect(created).not.toContain('b');
    // The nested child came along with `a`.
    const first = useCanvasStore.getState().elements[created[0]!];
    expect(first?.childIds).toHaveLength(1);
    expect(pageChildren()).toHaveLength(4);
  });

  it('gives two pasted subtrees distinct ids', () => {
    // Each clone is told only about the ids that existed before it, so
    // without accumulating across the loop the two could collide.
    useCanvasStore.getState().copyElements(['a', 'b']);
    const created = useCanvasStore.getState().pasteElement();
    expect(new Set(created).size).toBe(2);
    expect(Object.keys(useCanvasStore.getState().elements)).toHaveLength(
      // root + a + a1 + b + two clones + the nested clone
      7
    );
  });

  it('copies the page root as its children', () => {
    useCanvasStore.getState().copyElements([ROOT_ELEMENT_ID]);
    expect(useCanvasStore.getState().clipboard?.rootIds).toEqual(['a', 'b']);
  });

  it('leaves the clipboard alone when there is nothing to copy', () => {
    useCanvasStore.getState().copyElements(['a']);
    const before = useCanvasStore.getState().clipboard;
    useCanvasStore.getState().copyElements(['nope']);
    expect(useCanvasStore.getState().clipboard).toBe(before);
  });
});

describe('cutElements', () => {
  beforeEach(() => {
    seed({
      [ROOT_ELEMENT_ID]: makePageRoot(['a', 'b']),
      a: makeRect({ id: 'a', childIds: ['a1'] }),
      a1: makeRect({ id: 'a1', parentId: 'a' }),
      b: makeRect({ id: 'b' }),
    });
  });

  it('removes the element and its descendants, and clipboards them', () => {
    useCanvasStore.getState().cutElements(['a']);
    const state = useCanvasStore.getState();

    expect(state.elements['a']).toBeUndefined();
    expect(state.elements['a1']).toBeUndefined();
    expect(state.elements[ROOT_ELEMENT_ID]?.childIds).toEqual(['b']);
    expect(state.clipboard?.rootIds).toEqual(['a']);
  });

  it('takes exactly one undo step, even cutting several elements', () => {
    const before = historyLength();
    useCanvasStore.getState().cutElements(['a', 'b']);
    expect(historyLength()).toBe(before + 1);
  });

  it('can be pasted straight back', () => {
    useCanvasStore.getState().cutElements(['a']);
    const created = useCanvasStore.getState().pasteElement();
    expect(created).toHaveLength(1);
    // The subtree came back intact.
    expect(useCanvasStore.getState().elements[created[0]!]?.childIds).toHaveLength(1);
  });

  it('empties the page but keeps the root when cutting the root', () => {
    useCanvasStore.getState().cutElements([ROOT_ELEMENT_ID]);
    const state = useCanvasStore.getState();
    expect(state.elements[ROOT_ELEMENT_ID]).toBeDefined();
    expect(state.elements[ROOT_ELEMENT_ID]?.childIds).toEqual([]);
    expect(state.clipboard?.rootIds).toEqual(['a', 'b']);
  });

  it('drops cut elements from the selection', () => {
    useCanvasStore.setState({ selectedElementIds: ['a', 'b'] });
    useCanvasStore.getState().cutElements(['a']);
    expect(useCanvasStore.getState().selectedElementIds).toEqual(['b']);
  });

  it('does nothing when there is nothing to cut', () => {
    const before = historyLength();
    useCanvasStore.getState().cutElements([]);
    expect(pageChildren()).toHaveLength(2);
    expect(historyLength()).toBe(before);
  });
});
