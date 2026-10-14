import { describe, it, expect, beforeEach } from 'vitest';

import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID, type ScampElement } from '@lib/element';
import { axesForHandle } from '@lib/resizeAxes';
import { useCanvasStore } from '@store/canvasSlice';

/** A canvas handle sizes only the axes it moves. see docs/archive/2026-10-14-text-resize-height-plan.md */

describe('axesForHandle', () => {
  it('gives a side handle its own axis only', () => {
    expect(axesForHandle('e')).toEqual({ x: false, y: false, width: true, height: false });
    expect(axesForHandle('w')).toEqual({ x: true, y: false, width: true, height: false });
    expect(axesForHandle('s')).toEqual({ x: false, y: false, width: false, height: true });
    expect(axesForHandle('n')).toEqual({ x: false, y: true, width: false, height: true });
  });

  it('gives a corner both axes, moving x / y only from the left / top', () => {
    expect(axesForHandle('se')).toEqual({ x: false, y: false, width: true, height: true });
    expect(axesForHandle('nw')).toEqual({ x: true, y: true, width: true, height: true });
    expect(axesForHandle('ne')).toEqual({ x: false, y: true, width: true, height: true });
    expect(axesForHandle('sw')).toEqual({ x: true, y: false, width: true, height: true });
  });

  it('moves nothing for an unknown handle', () => {
    expect(axesForHandle('')).toEqual({ x: false, y: false, width: false, height: false });
  });
});

const textId = 'e5f6';

const hugText = (overrides: Partial<ScampElement> = {}): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  id: textId,
  type: 'text',
  text: 'A heading that wraps',
  parentId: ROOT_ELEMENT_ID,
  childIds: [],
  x: 40,
  y: 40,
  widthMode: 'fit-content',
  widthValue: 100,
  heightMode: 'fit-content',
  heightValue: 100,
  customProperties: {},
  ...overrides,
});

const reset = (el: ScampElement, breakpoint = 'desktop'): void => {
  useCanvasStore.setState({
    elements: {
      [ROOT_ELEMENT_ID]: { ...DEFAULT_RECT_STYLES, id: ROOT_ELEMENT_ID, type: 'rectangle', parentId: null, childIds: [el.id], x: 0, y: 0, customProperties: {} },
      [el.id]: el,
    },
    activeBreakpointId: breakpoint,
    activeStateName: null,
    snapshotPreview: null,
  });
};

const text = (): ScampElement | undefined => useCanvasStore.getState().elements[textId];

describe('resizeElement with axes', () => {
  beforeEach(() => reset(hugText()));

  it('an east drag fixes the width and leaves a hugging height alone', () => {
    useCanvasStore.getState().resizeElement(textId, 40, 40, 320, 48, axesForHandle('e'));
    expect(text()).toMatchObject({ widthMode: 'fixed', widthValue: 320, heightMode: 'fit-content', heightValue: 100 });
  });

  it('a south drag fixes the height and leaves the width alone', () => {
    useCanvasStore.getState().resizeElement(textId, 40, 40, 380, 90, axesForHandle('s'));
    expect(text()).toMatchObject({ widthMode: 'fit-content', heightMode: 'fixed', heightValue: 90 });
  });

  it('a corner drag fixes both, as Figma does', () => {
    useCanvasStore.getState().resizeElement(textId, 40, 40, 300, 90, axesForHandle('se'));
    expect(text()).toMatchObject({ widthMode: 'fixed', widthValue: 300, heightMode: 'fixed', heightValue: 90 });
  });

  it('a west drag moves x; an east drag leaves x and a kept offset alone', () => {
    reset(hugText({ customProperties: { left: '50%' } }));
    useCanvasStore.getState().resizeElement(textId, 999, 999, 320, 48, axesForHandle('e'));
    expect(text()).toMatchObject({ x: 40, y: 40 });
    expect(text()?.customProperties).toEqual({ left: '50%' });

    useCanvasStore.getState().resizeElement(textId, 100, 999, 260, 48, axesForHandle('w'));
    expect(text()).toMatchObject({ x: 100, y: 40 });
  });

  it('at a breakpoint, writes only the moved axis into the override', () => {
    reset(hugText(), 'tablet');
    useCanvasStore.getState().resizeElement(textId, 40, 40, 300, 48, axesForHandle('e'));
    expect(text()).toMatchObject({ widthMode: 'fit-content', heightMode: 'fit-content' });
    expect(text()?.breakpointOverrides?.['tablet']).toEqual({ widthMode: 'fixed', widthValue: 300 });
  });

  it('with no axes given, fixes everything, as before', () => {
    useCanvasStore.getState().resizeElement(textId, 10, 20, 300, 90);
    expect(text()).toMatchObject({ x: 10, y: 20, widthMode: 'fixed', widthValue: 300, heightMode: 'fixed', heightValue: 90 });
  });
});
