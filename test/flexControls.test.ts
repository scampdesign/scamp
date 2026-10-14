import { describe, it, expect } from 'vitest';

import { generateCode } from '@lib/generateCode';
import { breakpointOverrideLines } from '@lib/generateCode/declarations';
import { parseCode } from '@lib/parseCode';
import { DEFAULT_RECT_STYLES, DEFAULT_ROOT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID, type ScampElement } from '@lib/element';
import { DEFAULT_BREAKPOINTS } from '@shared/types';

/**
 * The flex vocabulary the Layout and Size sections expose, end to end
 * through the generator and the parser. Several cases here started life
 * as the Phase 0 characterisation tests in docs/archive/2026-09-04-flex-controls-plan.md
 * — each one names a value that used to be silently lost or degraded.
 */

const makeRoot = (childIds: string[] = []): ScampElement => ({
  ...DEFAULT_ROOT_STYLES,
  id: ROOT_ELEMENT_ID,
  type: 'rectangle',
  parentId: null,
  childIds,
  x: 0,
  y: 0,
  customProperties: {},
});

const makeRect = (overrides: Partial<ScampElement> & { id: string }): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  type: 'rectangle',
  parentId: ROOT_ELEMENT_ID,
  childIds: [],
  x: 0,
  y: 0,
  customProperties: {},
  ...overrides,
});

const cssFor = (elements: Record<string, ScampElement>): string =>
  generateCode({ elements, rootId: ROOT_ELEMENT_ID, pageName: 'home' }).css;

const block = (css: string, cls: string): string => {
  const m = css.match(new RegExp(`\\.${cls} \\{([^}]*)\\}`, 's'));
  return m?.[1] ?? '';
};

const TSX = `import styles from './home.module.css';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="a1b2" className={styles.rect_a1b2}>
        <div data-scamp-id="c3d4" className={styles.rect_c3d4} />
      </div>
    </div>
  );
}
`;

describe('flex container emission', () => {
  it('emits every non-default container field, in the flex spelling', () => {
    const css = cssFor({
      [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
      a1b2: makeRect({
        id: 'a1b2',
        display: 'flex',
        flexDirection: 'row-reverse',
        flexWrap: 'wrap',
        alignContent: 'space-between',
        alignItems: 'baseline',
        justifyContent: 'space-evenly',
      }),
    });
    const b = block(css, 'rect_a1b2');
    expect(b).toContain('flex-direction: row-reverse;');
    expect(b).toContain('flex-wrap: wrap;');
    expect(b).toContain('align-content: space-between;');
    expect(b).toContain('align-items: baseline;');
    expect(b).toContain('justify-content: space-evenly;');
  });

  it('emits nothing for the defaults', () => {
    const b = block(
      cssFor({ [ROOT_ELEMENT_ID]: makeRoot(['a1b2']), a1b2: makeRect({ id: 'a1b2', display: 'flex' }) }),
      'rect_a1b2'
    );
    expect(b).not.toContain('flex-wrap');
    expect(b).not.toContain('align-content');
    expect(b).not.toContain('flex-direction');
  });

  it('keeps per-axis gaps on a flex container (they used to be dropped)', () => {
    // Bug 1 in the plan: the parser mapped column-gap / row-gap into the
    // fields, and the flex branch of the generator never read them.
    const css = cssFor({
      [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
      a1b2: makeRect({ id: 'a1b2', display: 'flex', flexWrap: 'wrap', columnGap: 8, rowGap: 16 }),
    });
    const b = block(css, 'rect_a1b2');
    expect(b).toContain('column-gap: 8px;');
    expect(b).toContain('row-gap: 16px;');
    expect(b).not.toContain('gap: 0');
  });
});

describe('flex item emission', () => {
  it('emits the longhands for a child of a flex parent, never the shorthand', () => {
    const css = cssFor({
      [ROOT_ELEMENT_ID]: makeRoot(['row1']),
      row1: makeRect({ id: 'row1', display: 'flex', childIds: ['a1b2'] }),
      a1b2: makeRect({
        id: 'a1b2',
        parentId: 'row1',
        flexGrow: 1,
        flexShrink: 0,
        flexBasis: '200px',
        order: 2,
        alignSelf: 'end',
      }),
    });
    const b = block(css, 'rect_a1b2');
    expect(b).toContain('flex-grow: 1;');
    expect(b).toContain('flex-shrink: 0;');
    expect(b).toContain('flex-basis: 200px;');
    expect(b).toContain('order: 2;');
    expect(b).toContain('align-self: flex-end;');
    expect(b).not.toMatch(/^\s*flex:/m);
  });

  it('emits nothing item-related under a plain parent', () => {
    const css = cssFor({
      [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
      a1b2: makeRect({ id: 'a1b2', flexGrow: 1, flexShrink: 0, order: 3, alignSelf: 'center' }),
    });
    const b = block(css, 'rect_a1b2');
    expect(b).not.toContain('flex-grow');
    expect(b).not.toContain('flex-shrink');
    expect(b).not.toContain('order');
    expect(b).not.toContain('align-self');
  });

  it('emits order and the grid spelling of align-self under a grid parent', () => {
    const css = cssFor({
      [ROOT_ELEMENT_ID]: makeRoot(['g1']),
      g1: makeRect({ id: 'g1', display: 'grid', childIds: ['a1b2'] }),
      a1b2: makeRect({ id: 'a1b2', parentId: 'g1', order: -1, alignSelf: 'start', flexGrow: 1 }),
    });
    const b = block(css, 'rect_a1b2');
    expect(b).toContain('order: -1;');
    expect(b).toContain('align-self: start;');
    expect(b).not.toContain('flex-grow');
  });
});

describe('the fill-height contract is left alone', () => {
  it('writes flex: 1 for a stretch height in a column, alongside explicit longhands', () => {
    const css = cssFor({
      [ROOT_ELEMENT_ID]: makeRoot(['col1']),
      col1: makeRect({ id: 'col1', display: 'flex', flexDirection: 'column', childIds: ['a1b2'] }),
      a1b2: makeRect({ id: 'a1b2', parentId: 'col1', heightMode: 'stretch', flexShrink: 0 }),
    });
    const b = block(css, 'rect_a1b2');
    expect(b).toContain('flex: 1;');
    expect(b).toContain('flex-shrink: 0;');
    expect(b).not.toContain('flex-grow');
  });

  it('writes align-self: stretch exactly once for a stretch height in a row', () => {
    const css = cssFor({
      [ROOT_ELEMENT_ID]: makeRoot(['row1']),
      row1: makeRect({ id: 'row1', display: 'flex', childIds: ['a1b2'] }),
      a1b2: makeRect({ id: 'a1b2', parentId: 'row1', heightMode: 'stretch', alignSelf: 'stretch' }),
    });
    expect((block(css, 'rect_a1b2').match(/align-self/g) ?? []).length).toBe(1);
  });

  it('writes height: 100% plus the user’s align-self when they conflict', () => {
    const css = cssFor({
      [ROOT_ELEMENT_ID]: makeRoot(['row1']),
      row1: makeRect({ id: 'row1', display: 'flex', childIds: ['a1b2'] }),
      a1b2: makeRect({ id: 'a1b2', parentId: 'row1', heightMode: 'stretch', alignSelf: 'center' }),
    });
    const b = block(css, 'rect_a1b2');
    expect(b).toContain('height: 100%;');
    expect(b).toContain('align-self: center;');
    expect(b).not.toContain('align-self: stretch');
  });
});

describe('parsing hand-written flex CSS into typed fields', () => {
  const parse = (a1b2: string, c3d4: string = ''): Record<string, ScampElement> =>
    parseCode(
      TSX,
      `.root {\n  width: 100%;\n}\n\n.rect_a1b2 {\n  display: flex;\n${a1b2}}\n\n.rect_c3d4 {\n${c3d4}}\n`
    ).elements;

  it('reads every container value that used to degrade into customProperties', () => {
    const el = parse(
      '  flex-direction: column-reverse;\n  flex-wrap: wrap-reverse;\n  align-content: space-evenly;\n  justify-content: space-evenly;\n  align-items: baseline;\n  row-gap: 16px;\n  column-gap: 8px;\n'
    )['a1b2'];
    expect(el?.flexDirection).toBe('column-reverse');
    expect(el?.flexWrap).toBe('wrap-reverse');
    expect(el?.alignContent).toBe('space-evenly');
    expect(el?.justifyContent).toBe('space-evenly');
    expect(el?.alignItems).toBe('baseline');
    expect(el?.rowGap).toBe(16);
    expect(el?.columnGap).toBe(8);
    expect(el?.customProperties).toEqual({});
  });

  it('reads every child value, including the tutorial spelling of align-self', () => {
    const el = parse('', '  flex-grow: 1;\n  flex-shrink: 0;\n  flex-basis: 200px;\n  order: 2;\n  align-self: flex-end;\n')['c3d4'];
    expect(el?.flexGrow).toBe(1);
    expect(el?.flexShrink).toBe(0);
    expect(el?.flexBasis).toBe('200px');
    expect(el?.order).toBe(2);
    expect(el?.alignSelf).toBe('end');
    expect(el?.customProperties).toEqual({});
  });

  it('expands a flex shorthand on a row child into the fields', () => {
    const el = parse('', '  flex: 1 1 200px;\n')['c3d4'];
    expect(el?.flexGrow).toBe(1);
    expect(el?.flexShrink).toBe(1);
    expect(el?.flexBasis).toBe('200px');
    expect(el?.customProperties).toEqual({});
  });

  it('still folds the exact fill-height `flex: 1` into the mode, with clean fields', () => {
    const el = parse('  flex-direction: column;\n', '  flex: 1;\n')['c3d4'];
    expect(el?.heightMode).toBe('stretch');
    expect(el?.flexGrow).toBe(0);
    expect(el?.flexBasis).toBe('');
    expect(el?.customProperties).toEqual({});
  });

  it('folds align-self: stretch on a heightless row child into the mode, field back to auto', () => {
    const el = parse('', '  align-self: stretch;\n')['c3d4'];
    expect(el?.heightMode).toBe('stretch');
    expect(el?.alignSelf).toBe('auto');
  });

  it('keeps an explicit align-self: stretch when the child has a height', () => {
    // Previously the default WAS stretch, so this declaration was lost.
    const el = parse('', '  height: 200px;\n  align-self: stretch;\n')['c3d4'];
    expect(el?.heightMode).toBe('fixed');
    expect(el?.alignSelf).toBe('stretch');
  });

  it('reads the legacy custom-property guard as the typed field', () => {
    const el = parse('', '  width: 180px;\n  flex-shrink: 0;\n')['c3d4'];
    expect(el?.flexShrink).toBe(0);
    expect(el?.customProperties).toEqual({});
  });
});

describe('round trip', () => {
  it('generateCode → parseCode reproduces a fully-specified flex parent and child', () => {
    const elements: Record<string, ScampElement> = {
      [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
      a1b2: makeRect({
        id: 'a1b2',
        display: 'flex',
        flexDirection: 'row-reverse',
        flexWrap: 'wrap',
        alignContent: 'center',
        alignItems: 'baseline',
        justifyContent: 'space-evenly',
        columnGap: 8,
        rowGap: 16,
        childIds: ['c3d4'],
        widthMode: 'auto',
        heightMode: 'auto',
      }),
      c3d4: makeRect({
        id: 'c3d4',
        parentId: 'a1b2',
        widthMode: 'auto',
        heightMode: 'auto',
        flexGrow: 2,
        flexShrink: 0,
        flexBasis: '10%',
        order: 3,
        alignSelf: 'baseline',
      }),
    };
    const { tsx, css } = generateCode({ elements, rootId: ROOT_ELEMENT_ID, pageName: 'home' });
    const parsed = parseCode(tsx, css);
    expect(parsed.elements['a1b2']).toEqual(elements['a1b2']);
    expect(parsed.elements['c3d4']).toEqual(elements['c3d4']);
  });

  it('is text-stable for the legacy guard and the shorthand-free longhands', () => {
    const elements: Record<string, ScampElement> = {
      [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
      a1b2: makeRect({ id: 'a1b2', display: 'flex', childIds: ['c3d4'], widthMode: 'auto', heightMode: 'auto' }),
      c3d4: makeRect({ id: 'c3d4', parentId: 'a1b2', widthMode: 'fixed', widthValue: 180, heightMode: 'auto', flexShrink: 0 }),
    };
    const first = generateCode({ elements, rootId: ROOT_ELEMENT_ID, pageName: 'home' });
    const reparsed = parseCode(first.tsx, first.css);
    const second = generateCode({ elements: reparsed.elements, rootId: ROOT_ELEMENT_ID, pageName: 'home' });
    expect(second.css).toBe(first.css);
  });
});

describe('breakpoint / state override lines', () => {
  const el = makeRect({ id: 'a1b2', display: 'flex' });
  const flexParent = makeRect({ id: 'p', display: 'flex' });
  const gridParent = makeRect({ id: 'p', display: 'grid' });

  it('emits the container fields when overridden', () => {
    const lines = breakpointOverrideLines({ flexWrap: 'wrap', alignContent: 'stretch' }, el);
    expect(lines).toContain('flex-wrap: wrap;');
    expect(lines).toContain('align-content: stretch;');
  });

  it('emits the item fields, with an empty basis clearing to auto', () => {
    const lines = breakpointOverrideLines(
      { flexGrow: 1, flexShrink: 0, flexBasis: '', order: 1 },
      el,
      flexParent
    );
    expect(lines).toEqual(
      expect.arrayContaining(['flex-grow: 1;', 'flex-shrink: 0;', 'flex-basis: auto;', 'order: 1;'])
    );
  });

  it('spells align-self for the parent it is under', () => {
    expect(breakpointOverrideLines({ alignSelf: 'start' }, el, flexParent)).toContain('align-self: flex-start;');
    expect(breakpointOverrideLines({ alignSelf: 'start' }, el, gridParent)).toContain('align-self: start;');
    expect(breakpointOverrideLines({ alignSelf: 'auto' }, el, flexParent)).toContain('align-self: auto;');
  });

  it('round-trips a per-breakpoint wrap through the file', () => {
    const elements: Record<string, ScampElement> = {
      [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
      a1b2: makeRect({
        id: 'a1b2',
        display: 'flex',
        widthMode: 'auto',
        heightMode: 'auto',
        breakpointOverrides: { mobile: { flexWrap: 'wrap', rowGap: 12 } },
      }),
    };
    const { tsx, css } = generateCode({
      elements,
      rootId: ROOT_ELEMENT_ID,
      pageName: 'home',
      breakpoints: DEFAULT_BREAKPOINTS,
    });
    expect(css).toMatch(/flex-wrap: wrap;/);
    const parsed = parseCode(tsx, css, { breakpoints: DEFAULT_BREAKPOINTS });
    expect(parsed.elements['a1b2']?.breakpointOverrides?.['mobile']).toEqual({ flexWrap: 'wrap', rowGap: 12 });
  });
});
