import { describe, it, expect, beforeEach } from 'vitest';

import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID, type ScampElement } from '@lib/element';
import { fitPatch, leadFor, mixedFields, SECTION_FITS } from '@lib/multiEdit';
import { axisGapPatch } from '@lib/flexGap';
import { useCanvasStore } from '@store/canvasSlice';
import { useHistoryStore } from '@store/historySlice';
import { forSelection, patchSelection, patchSelectionCustomProperties } from '@store/selectionPatch';

const el = (id: string, overrides: Partial<ScampElement> = {}): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  id,
  type: 'rectangle',
  parentId: ROOT_ELEMENT_ID,
  childIds: [],
  x: 0,
  y: 0,
  customProperties: {},
  ...overrides,
});

const root = (childIds: string[]): ScampElement => ({ ...el(ROOT_ELEMENT_ID, { childIds }), parentId: null });

describe('fitPatch', () => {
  const rect = el('a1b2');
  const text = el('c3d4', { type: 'text', text: 'Hi' });
  const instance = el('e5f6', { type: 'component-instance' });

  it('keeps typography for text and drops it for a rectangle', () => {
    expect(fitPatch(text, { fontSize: '20px' }, SECTION_FITS.typography, false)).toEqual({ fontSize: '20px' });
    expect(fitPatch(rect, { fontSize: '20px' }, SECTION_FITS.typography, false)).toBeNull();
  });

  it('keeps container layout off text, inputs, and instances', () => {
    expect(fitPatch(rect, { display: 'flex' }, SECTION_FITS.layout, false)).toEqual({ display: 'flex' });
    expect(fitPatch(text, { display: 'flex' }, SECTION_FITS.layout, false)).toBeNull();
    expect(fitPatch(el('i1', { type: 'input' }), { display: 'flex' }, SECTION_FITS.layout, false)).toBeNull();
    expect(fitPatch(instance, { display: 'flex' }, SECTION_FITS.layout, false)).toBeNull();
  });

  it('gives an instance its size but not a background', () => {
    expect(fitPatch(instance, { widthValue: 120 }, SECTION_FITS.size, false)).toEqual({ widthValue: 120 });
    expect(fitPatch(instance, { backgroundColor: 'red' }, SECTION_FITS.box, false)).toBeNull();
  });

  it('copies an element’s own fields only to the element they came from', () => {
    const patch: Partial<ScampElement> = { name: 'hero', backgroundColor: 'red' };
    expect(fitPatch(rect, patch, SECTION_FITS.box, true)).toEqual(patch);
    expect(fitPatch(rect, patch, SECTION_FITS.box, false)).toEqual({ backgroundColor: 'red' });
    expect(fitPatch(rect, { tag: 'section' }, SECTION_FITS.box, false)).toBeNull();
  });

  it('drops margin for the root and keeps its padding', () => {
    const patch: Partial<ScampElement> = { margin: [4, 4, 4, 4], padding: [8, 8, 8, 8] };
    expect(fitPatch(root([]), patch, SECTION_FITS.box, false)).toEqual({ padding: [8, 8, 8, 8] });
  });

  it('returns null for an empty patch', () => {
    expect(fitPatch(rect, {}, SECTION_FITS.box, true)).toBeNull();
  });
});

describe('leadFor', () => {
  const elements = { a: el('a'), t: el('t', { type: 'text' }), i: el('i', { type: 'component-instance' }) };

  it('picks the first selected element the section fits, in selection order', () => {
    expect(leadFor(['a', 't'], elements, SECTION_FITS.typography)).toBe('t');
    expect(leadFor(['i', 'a'], elements, SECTION_FITS.box)).toBe('a');
    expect(leadFor(['i', 'a'], elements, SECTION_FITS.size)).toBe('i');
  });

  it('returns null when nothing fits, or an id is gone', () => {
    expect(leadFor(['a', 'i'], elements, SECTION_FITS.typography)).toBeNull();
    expect(leadFor(['gone'], elements, SECTION_FITS.box)).toBeNull();
    expect(leadFor([], elements, SECTION_FITS.box)).toBeNull();
  });
});

describe('mixedFields', () => {
  it('lists the fields that differ, and custom CSS as custom:<property>', () => {
    const a = el('a', { backgroundColor: 'red', padding: [8, 8, 8, 8], customProperties: { cursor: 'pointer' } });
    const b = el('b', { backgroundColor: 'blue', padding: [8, 8, 8, 8], customProperties: {} });
    expect(mixedFields([a, b])).toEqual(['backgroundColor', 'custom:cursor']);
  });

  it('compares arrays and tuples by value', () => {
    const a = el('a', { borderWidth: [1, 1, 1, 1] });
    const b = el('b', { borderWidth: [1, 1, 1, 1] });
    expect(mixedFields([a, b])).toEqual([]);
    expect(mixedFields([a, el('c', { borderWidth: [2, 1, 1, 1] })])).toEqual(['borderWidth']);
  });

  it('never reports identity, position, or override maps', () => {
    const a = el('a', { name: 'one', x: 0, breakpointOverrides: { tablet: { padding: [4, 4, 4, 4] } } });
    const b = el('b', { name: 'two', x: 40 });
    expect(mixedFields([a, b])).toEqual([]);
  });

  it('reports a field only one element sets', () => {
    expect(mixedFields([el('a', { fontSize: '12px' }), el('b')])).toEqual(['fontSize']);
  });

  it('is empty for one element or none', () => {
    expect(mixedFields([el('a')])).toEqual([]);
    expect(mixedFields([])).toEqual([]);
  });
});

describe('patchSelection', () => {
  beforeEach(() => {
    useHistoryStore.setState({ perPage: {}, activePageId: null, transactionDepth: 0, pendingExternalEdit: null });
    useHistoryStore.getState().setActivePageId('home.tsx');
    useCanvasStore.setState({
      elements: {
        [ROOT_ELEMENT_ID]: root(['a1b2', 'c3d4', 't1t1']),
        a1b2: el('a1b2', { customProperties: { 'background-size': 'contain' } }),
        c3d4: el('c3d4', { customProperties: { cursor: 'pointer' } }),
        t1t1: el('t1t1', { type: 'text', text: 'Hi' }),
      },
      selectedElementIds: ['a1b2', 'c3d4', 't1t1'],
      activeBreakpointId: 'desktop',
      activeStateName: null,
      snapshotPreview: null,
    });
  });

  const elements = (): Record<string, ScampElement> => useCanvasStore.getState().elements;
  const entries = (): number => useHistoryStore.getState().perPage['home.tsx']?.entries.length ?? 0;

  it('sets every selected element in one undo step', () => {
    patchSelection(SECTION_FITS.box, 'a1b2', { backgroundColor: '#ff0000' });
    expect(elements()['a1b2']?.backgroundColor).toBe('#ff0000');
    expect(elements()['c3d4']?.backgroundColor).toBe('#ff0000');
    expect(elements()['t1t1']?.backgroundColor).toBe('#ff0000');
    expect(entries()).toBe(1);
    expect(useHistoryStore.getState().perPage['home.tsx']?.entries[0]?.elementIds).toEqual(['a1b2', 'c3d4', 't1t1']);
  });

  it('reaches only the elements the section fits', () => {
    patchSelection(SECTION_FITS.typography, 't1t1', { fontSize: '24px' });
    expect(elements()['t1t1']?.fontSize).toBe('24px');
    expect(elements()['a1b2']?.fontSize).toBeUndefined();
  });

  it('routes each element’s change into its own breakpoint override', () => {
    useCanvasStore.setState({ activeBreakpointId: 'tablet' });
    patchSelection(SECTION_FITS.box, 'a1b2', { padding: [8, 8, 8, 8] });
    for (const id of ['a1b2', 'c3d4']) {
      expect(elements()[id]?.padding).toEqual([0, 0, 0, 0]);
      expect(elements()[id]?.breakpointOverrides?.['tablet']?.padding).toEqual([8, 8, 8, 8]);
    }
  });

  it('routes into each element’s state override', () => {
    useCanvasStore.setState({ activeStateName: 'hover' });
    patchSelection(SECTION_FITS.box, 'a1b2', { backgroundColor: '#00ff00' });
    expect(elements()['c3d4']?.stateOverrides?.['hover']?.backgroundColor).toBe('#00ff00');
    expect(elements()['c3d4']?.backgroundColor).toBe(DEFAULT_RECT_STYLES.backgroundColor);
  });

  it('merges custom CSS into each element’s own, keeping what the others had', () => {
    patchSelectionCustomProperties(SECTION_FITS.box, 'a1b2', { 'background-repeat': 'repeat' });
    expect(elements()['a1b2']?.customProperties).toEqual({ 'background-size': 'contain', 'background-repeat': 'repeat' });
    expect(elements()['c3d4']?.customProperties).toEqual({ cursor: 'pointer', 'background-repeat': 'repeat' });
    expect(entries()).toBe(1);
  });

  it('renames only the element the name came from', () => {
    patchSelection(SECTION_FITS.box, 'a1b2', { name: 'hero' });
    expect(elements()['a1b2']?.name).toBe('hero');
    expect(elements()['c3d4']?.name).toBeUndefined();
  });

  it('patches only the given element when it isn’t part of the selection', () => {
    useCanvasStore.setState({ selectedElementIds: ['a1b2'] });
    patchSelection(SECTION_FITS.box, 'a1b2', { backgroundColor: '#123456' });
    expect(elements()['a1b2']?.backgroundColor).toBe('#123456');
    expect(elements()['c3d4']?.backgroundColor).toBe(DEFAULT_RECT_STYLES.backgroundColor);
  });

  it('builds a function patch from each element’s own values', () => {
    // One `gap` each; setting the column gap splits it, keeping the row gap.
    useCanvasStore.setState((s) => ({
      elements: {
        ...s.elements,
        a1b2: el('a1b2', { display: 'flex', gap: 10 }),
        c3d4: el('c3d4', { display: 'flex', gap: 20 }),
      },
    }));
    patchSelection(SECTION_FITS.layout, 'a1b2', (resolved) => axisGapPatch(resolved, 'columnGap', 16));
    expect(elements()['a1b2']).toMatchObject({ columnGap: 16, rowGap: 10, gap: 0 });
    // Its own row gap, not the first element's.
    expect(elements()['c3d4']).toMatchObject({ columnGap: 16, rowGap: 20, gap: 0 });
  });

  it('runs an action on each fitting selected element as one step', () => {
    const seen: string[] = [];
    forSelection(SECTION_FITS.typography, 't1t1', ['fontSize'], (id) => seen.push(id));
    expect(seen).toEqual(['t1t1']);
    forSelection(SECTION_FITS.box, 'a1b2', ['toggledOffGroups'], (id) =>
      useCanvasStore.getState().togglePropertyGroup(id, 'background', false)
    );
    expect(elements()['c3d4']?.toggledOffGroups).toEqual(['background']);
    expect(entries()).toBe(1);
  });

  it('writes nothing while a snapshot preview is showing', () => {
    const before = elements();
    useCanvasStore.setState({ snapshotPreview: {} as NonNullable<ReturnType<typeof useCanvasStore.getState>['snapshotPreview']> });
    patchSelection(SECTION_FITS.box, 'a1b2', { backgroundColor: '#ff0000' });
    expect(elements()).toBe(before);
    expect(entries()).toBe(0);
  });
});
