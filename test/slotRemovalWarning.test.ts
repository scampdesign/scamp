import { describe, it, expect } from 'vitest';
import {
  findInstancesWithSlotContent,
  groupUsagesByPage,
} from '@lib/componentUsage';
import { generateCode } from '@lib/generateCode';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID, type ScampElement } from '@lib/element';
import type { PageFile } from '@shared/types';

/**
 * Phase 4 (component slots): the cross-page scan that powers the
 * "remove slot" confirm dialog — which instances on which pages have
 * content filling a given slot. see docs/archive/2026-07-16-component-slots-plan.md
 */

const makePageRoot = (childIds: string[]): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  id: ROOT_ELEMENT_ID,
  type: 'rectangle',
  parentId: null,
  childIds,
  widthMode: 'stretch',
  heightMode: 'auto',
  minHeight: '100vh',
  x: 0,
  y: 0,
  backgroundColor: '#ffffff',
  customProperties: {},
});

const makeInstance = (
  id: string,
  componentName: string,
  childIds: string[]
): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  id,
  type: 'component-instance',
  parentId: ROOT_ELEMENT_ID,
  childIds,
  widthMode: 'auto',
  heightMode: 'auto',
  x: 0,
  y: 0,
  customProperties: {},
  instanceId: `inst_${id}`,
  componentName,
  propOverrides: {},
});

const makeSlotText = (
  id: string,
  parentId: string,
  text: string,
  slotName?: string
): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  id,
  type: 'text',
  parentId,
  childIds: [],
  x: 0,
  y: 0,
  text,
  customProperties: {},
  ...(slotName !== undefined ? { slotName } : {}),
});

/**
 * A page with one BlueBox instance whose slot content is described by
 * `contents` (each entry becomes a text child, tagged with slotName unless
 * it's the default `children` slot).
 */
const pageWithSlotContent = (
  name: string,
  contents: ReadonlyArray<{ text: string; slotName?: string }>
): PageFile => {
  const instId = 'inst_bluebox';
  const childIds = contents.map((_, i) => `c${i}`);
  const elements: Record<string, ScampElement> = {
    [ROOT_ELEMENT_ID]: makePageRoot([instId]),
    [instId]: makeInstance(instId, 'BlueBox', childIds),
  };
  contents.forEach((c, i) => {
    elements[`c${i}`] = makeSlotText(`c${i}`, instId, c.text, c.slotName);
  });
  const { tsx, css } = generateCode({
    elements,
    rootId: ROOT_ELEMENT_ID,
    pageName: name,
  });
  return {
    name,
    tsxPath: `/tmp/${name}.tsx`,
    cssPath: `/tmp/${name}.module.css`,
    tsxContent: tsx,
    cssContent: css,
  };
};

describe('findInstancesWithSlotContent', () => {
  it('finds an instance whose named slot has content', () => {
    const pages = [
      pageWithSlotContent('home', [{ text: 'Hello', slotName: 'header' }]),
    ];
    const found = findInstancesWithSlotContent(pages, 'BlueBox', 'header');
    expect(found.length).toBe(1);
    expect(found[0]!.pageName).toBe('home');
  });

  it('matches default-slot content under the `children` name', () => {
    const pages = [pageWithSlotContent('home', [{ text: 'Plain child' }])];
    expect(
      findInstancesWithSlotContent(pages, 'BlueBox', 'children').length
    ).toBe(1);
  });

  it('returns empty for a slot the instance has no content in', () => {
    const pages = [
      pageWithSlotContent('home', [{ text: 'Hello', slotName: 'header' }]),
    ];
    expect(findInstancesWithSlotContent(pages, 'BlueBox', 'footer')).toEqual(
      []
    );
  });

  it('ignores instances of a different component', () => {
    const pages = [
      pageWithSlotContent('home', [{ text: 'Hello', slotName: 'header' }]),
    ];
    expect(findInstancesWithSlotContent(pages, 'OtherBox', 'header')).toEqual(
      []
    );
  });

  it('aggregates across pages and groups by page', () => {
    const pages = [
      pageWithSlotContent('home', [{ text: 'A', slotName: 'header' }]),
      pageWithSlotContent('about', [{ text: 'B', slotName: 'header' }]),
    ];
    const found = findInstancesWithSlotContent(pages, 'BlueBox', 'header');
    expect(found.length).toBe(2);
    expect(groupUsagesByPage(found)).toEqual([
      { pageName: 'home', count: 1 },
      { pageName: 'about', count: 1 },
    ]);
  });

  it('does not throw on a malformed page (under-reports instead)', () => {
    const bad: PageFile = {
      name: 'broken',
      tsxPath: '/tmp/broken.tsx',
      cssPath: '/tmp/broken.module.css',
      tsxContent: '<<< not valid tsx',
      cssContent: '',
    };
    expect(() =>
      findInstancesWithSlotContent([bad], 'BlueBox', 'header')
    ).not.toThrow();
  });
});
