import { describe, it, expect, beforeEach } from 'vitest';

import { useCanvasStore } from '@store/canvasSlice';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID, type ScampElement } from '@lib/element';

/**
 * Styling a range of a text element, through the store.
 *
 * Phase 4 of `docs/plans/inline-spans-plan.md`. The pure half is
 * `textRuns.test.ts`; this covers what the action does to an element —
 * when it writes `runs`, when it deliberately does not, and what a
 * retyped sentence does to styling that no longer fits it.
 */

const base = { ...DEFAULT_RECT_STYLES, x: 0, y: 0, customProperties: {} };

const seed = (text: string): void => {
  const elements: Record<string, ScampElement> = {
    [ROOT_ELEMENT_ID]: {
      ...base,
      id: ROOT_ELEMENT_ID,
      type: 'rectangle',
      parentId: null,
      childIds: ['t1'],
      name: 'root',
    },
    t1: {
      ...base,
      id: 't1',
      type: 'text',
      parentId: ROOT_ELEMENT_ID,
      childIds: [],
      name: 'hero',
      text,
    },
  };
  useCanvasStore.setState({ elements, snapshotPreview: null });
};

const el = (): ScampElement | undefined => useCanvasStore.getState().elements['t1'];

describe('styleTextRange', () => {
  beforeEach(() => seed('works alongside AI.'));

  it('styles exactly the selected characters', () => {
    useCanvasStore.getState().styleTextRange('t1', 6, 15, { color: '#0ACD95' });
    expect(el()?.runs).toEqual([
      { text: 'works ' },
      { text: 'alongside', style: { color: '#0ACD95' } },
      { text: ' AI.' },
    ]);
  });

  it('keeps `text` as the words, so every existing reader still works', () => {
    useCanvasStore.getState().styleTextRange('t1', 6, 15, { color: '#0ACD95' });
    expect(el()?.text).toBe('works alongside AI.');
  });

  it('stores no runs when the result is plain again', () => {
    // Styling a word and clearing it must leave the element exactly as
    // it started, not carrying a one-run list forever.
    useCanvasStore.getState().styleTextRange('t1', 6, 15, { color: '#0ACD95' });
    useCanvasStore.getState().styleTextRange('t1', 6, 15, { color: null });
    expect(el()?.runs).toBeUndefined();
    expect(el()?.text).toBe('works alongside AI.');
  });

  it('merges into a style the range already had', () => {
    useCanvasStore.getState().styleTextRange('t1', 6, 15, { fontWeight: 700 });
    useCanvasStore.getState().styleTextRange('t1', 6, 15, { color: '#f00' });
    expect(el()?.runs?.[1]?.style).toEqual({ fontWeight: 700, color: '#f00' });
  });

  it('leaves a non-text element alone', () => {
    useCanvasStore.getState().styleTextRange(ROOT_ELEMENT_ID, 0, 3, { color: '#f00' });
    expect(useCanvasStore.getState().elements[ROOT_ELEMENT_ID]?.runs).toBeUndefined();
  });

  it('does nothing while a snapshot is being previewed', () => {
    // Same guard every other edit has: a preview is a look at the past,
    // not a thing you can edit.
    useCanvasStore.setState({ snapshotPreview: { id: 'x' } as never });
    useCanvasStore.getState().styleTextRange('t1', 6, 15, { color: '#f00' });
    expect(el()?.runs).toBeUndefined();
  });

  it('drops the runs when the words are retyped', () => {
    // The offsets the runs were split at describe text that no longer
    // exists. Keeping them would style the wrong words; dropping them
    // is a visible loss, which is the honest outcome.
    useCanvasStore.getState().styleTextRange('t1', 6, 15, { color: '#0ACD95' });
    expect(el()?.runs).toBeDefined();
    useCanvasStore.getState().setElementText('t1', 'something else entirely');
    expect(el()?.runs).toBeUndefined();
    expect(el()?.text).toBe('something else entirely');
  });
});

describe('textSelection', () => {
  beforeEach(() => seed('works alongside AI.'));

  it('is cleared when the edit target changes', () => {
    // Offsets into one element's text mean nothing in another's.
    useCanvasStore.getState().setTextSelection({ elementId: 't1', start: 0, end: 5 });
    useCanvasStore.getState().setEditingElement('other');
    expect(useCanvasStore.getState().textSelection).toBeNull();
  });
});

describe('the selection outlives leaving edit mode', () => {
  /**
   * Reported: selecting a word and clicking Bold in the panel emboldened
   * the WHOLE element.
   *
   * Clicking a panel control blurs the contentEditable, which ends edit
   * mode — and ending edit mode cleared the selection, so by the time
   * the control fired there was no range left and it fell back to the
   * element. The selection has to survive the blur, because reaching the
   * panel IS a blur.
   */
  beforeEach(() => seed('make this bold'));

  it('survives leaving edit mode, which is how the panel is reached', () => {
    useCanvasStore.getState().setTextSelection({ elementId: 't1', start: 10, end: 14 });
    useCanvasStore.getState().setEditingElement(null);
    expect(useCanvasStore.getState().textSelection).toEqual({
      elementId: 't1',
      start: 10,
      end: 14,
    });
  });

  it('is still there to style after the blur', () => {
    useCanvasStore.getState().setTextSelection({ elementId: 't1', start: 10, end: 14 });
    useCanvasStore.getState().setEditingElement(null);
    const range = useCanvasStore.getState().textSelection;
    expect(range).not.toBeNull();
    useCanvasStore
      .getState()
      .styleTextRange('t1', range!.start, range!.end, { fontWeight: 700 });
    expect(useCanvasStore.getState().elements['t1']?.runs).toEqual([
      { text: 'make this ' },
      { text: 'bold', style: { fontWeight: 700 } },
    ]);
  });

  it('still clears when a DIFFERENT element is edited', () => {
    // Offsets into one element's text mean nothing in another's.
    useCanvasStore.getState().setTextSelection({ elementId: 't1', start: 0, end: 4 });
    useCanvasStore.getState().setEditingElement('other');
    expect(useCanvasStore.getState().textSelection).toBeNull();
  });

  it('clears when another element is selected on the canvas', () => {
    // Otherwise a stale range styles words the user is no longer
    // looking at, the next time they touch a control.
    useCanvasStore.getState().setTextSelection({ elementId: 't1', start: 0, end: 4 });
    useCanvasStore.getState().selectElement('other');
    expect(useCanvasStore.getState().textSelection).toBeNull();
  });
});
