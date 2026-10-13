import { describe, it, expect } from 'vitest';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import {
  ROOT_ELEMENT_ID,
  type BoxShadowDef,
  type ScampElement,
} from '@lib/element';
import { DEFAULT_BREAKPOINTS } from '@shared/types';

const makeRoot = (childIds: string[] = []): ScampElement => ({
  id: ROOT_ELEMENT_ID,
  type: 'rectangle',
  parentId: null,
  childIds,
  widthMode: 'stretch',
  widthValue: 1440,
  heightMode: 'auto',
  heightValue: 900,
  minHeight: '100vh',
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

const makeRect = (id: string, overrides: Partial<ScampElement> = {}): ScampElement => ({
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

const SHADOW_A: BoxShadowDef = {
  offsetX: 0,
  offsetY: 4,
  blur: 8,
  spread: 0,
  color: 'rgba(0, 0, 0, 0.15)',
  inset: false,
};

const SHADOW_B: BoxShadowDef = {
  offsetX: 0,
  offsetY: 1,
  blur: 2,
  spread: 0,
  color: 'rgba(0, 0, 0, 0.08)',
  inset: false,
};

const SHADOW_INSET: BoxShadowDef = {
  offsetX: 0,
  offsetY: 0,
  blur: 0,
  spread: 1,
  color: '#ffffff',
  inset: true,
};

describe('box-shadow: generator', () => {
  it('omits the box-shadow declaration when boxShadows is empty', () => {
    const elements = {
      [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
      a1b2: makeRect('a1b2'),
    };
    const { css } = generateCode({
      elements,
      rootId: ROOT_ELEMENT_ID,
      pageName: 'home',
      breakpoints: DEFAULT_BREAKPOINTS,
      customMediaBlocks: [],
    });
    expect(css).not.toContain('box-shadow');
  });

  it('emits a single shadow as the box-shadow shorthand', () => {
    const elements = {
      [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
      a1b2: makeRect('a1b2', { boxShadows: [SHADOW_A] }),
    };
    const { css } = generateCode({
      elements,
      rootId: ROOT_ELEMENT_ID,
      pageName: 'home',
      breakpoints: DEFAULT_BREAKPOINTS,
      customMediaBlocks: [],
    });
    expect(css).toContain('box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.15);');
  });

  it('emits multiple shadows comma-separated, in order', () => {
    const elements = {
      [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
      a1b2: makeRect('a1b2', { boxShadows: [SHADOW_A, SHADOW_B] }),
    };
    const { css } = generateCode({
      elements,
      rootId: ROOT_ELEMENT_ID,
      pageName: 'home',
      breakpoints: DEFAULT_BREAKPOINTS,
      customMediaBlocks: [],
    });
    expect(css).toContain(
      'box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.15), 0px 1px 2px rgba(0, 0, 0, 0.08);'
    );
  });

  it('emits inset shadows with the keyword leading', () => {
    const elements = {
      [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
      a1b2: makeRect('a1b2', { boxShadows: [SHADOW_INSET] }),
    };
    const { css } = generateCode({
      elements,
      rootId: ROOT_ELEMENT_ID,
      pageName: 'home',
      breakpoints: DEFAULT_BREAKPOINTS,
      customMediaBlocks: [],
    });
    expect(css).toContain('box-shadow: inset 0px 0px 0px 1px #ffffff;');
  });
});

describe('box-shadow: parser', () => {
  it('routes a parseable box-shadow into the typed boxShadows field', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}><div data-scamp-id="a1b2" className={styles.rect_a1b2} /></div>`;
    const css = `.rect_a1b2 { box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.15); }`;
    const { elements } = parseCode(tsx, css);
    expect(elements['a1b2']?.boxShadows).toEqual([SHADOW_A]);
    expect(elements['a1b2']?.customProperties).toEqual({});
  });

  it('parses a multi-shadow list back into the field in order', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}><div data-scamp-id="a1b2" className={styles.rect_a1b2} /></div>`;
    const css = `.rect_a1b2 {
      box-shadow:
        0 4px 8px 0 rgba(0, 0, 0, 0.15),
        0 1px 2px 0 rgba(0, 0, 0, 0.08);
    }`;
    const { elements } = parseCode(tsx, css);
    expect(elements['a1b2']?.boxShadows).toEqual([SHADOW_A, SHADOW_B]);
  });

  it('reads a whole-value token as boxShadowToken, not layers', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}><div data-scamp-id="a1b2" className={styles.rect_a1b2} /></div>`;
    const css = `.rect_a1b2 { box-shadow: var(--shadow-md); }`;
    const { elements } = parseCode(tsx, css);
    expect(elements['a1b2']?.boxShadows).toEqual([]);
    expect(elements['a1b2']?.boxShadowToken).toBe('var(--shadow-md)');
    expect(elements['a1b2']?.customProperties).toEqual({});
  });

  it('preserves an unparseable box-shadow in customProperties', () => {
    const tsx = `<div data-scamp-id="root" className={styles.root}><div data-scamp-id="a1b2" className={styles.rect_a1b2} /></div>`;
    const css = `.rect_a1b2 { box-shadow: inherit; }`;
    const { elements } = parseCode(tsx, css);
    expect(elements['a1b2']?.boxShadows).toEqual([]);
    expect(elements['a1b2']?.customProperties).toEqual({ 'box-shadow': 'inherit' });
  });
});

describe('box-shadow: round-trip', () => {
  it('round-trips a multi-shadow with mixed inset and rgba colors', () => {
    const elements = {
      [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
      a1b2: makeRect('a1b2', {
        boxShadows: [SHADOW_A, SHADOW_B, SHADOW_INSET],
      }),
    };
    const { tsx, css } = generateCode({
      elements,
      rootId: ROOT_ELEMENT_ID,
      pageName: 'home',
      breakpoints: DEFAULT_BREAKPOINTS,
      customMediaBlocks: [],
    });
    const { elements: parsed } = parseCode(tsx, css);
    expect(parsed['a1b2']?.boxShadows).toEqual([
      SHADOW_A,
      SHADOW_B,
      SHADOW_INSET,
    ]);
  });

  it('round-trips an empty list as no declaration', () => {
    const elements = {
      [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
      a1b2: makeRect('a1b2'),
    };
    const { tsx, css } = generateCode({
      elements,
      rootId: ROOT_ELEMENT_ID,
      pageName: 'home',
      breakpoints: DEFAULT_BREAKPOINTS,
      customMediaBlocks: [],
    });
    const { elements: parsed } = parseCode(tsx, css);
    expect(parsed['a1b2']?.boxShadows).toEqual([]);
    expect(css).not.toContain('box-shadow');
  });
});

describe('box-shadow: state overrides', () => {
  it('emits and parses a hover-state shadow override', () => {
    const elements = {
      [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
      a1b2: makeRect('a1b2', {
        boxShadows: [SHADOW_B],
        stateOverrides: {
          hover: {
            boxShadows: [SHADOW_A],
          },
        },
      }),
    };
    const { tsx, css } = generateCode({
      elements,
      rootId: ROOT_ELEMENT_ID,
      pageName: 'home',
      breakpoints: DEFAULT_BREAKPOINTS,
      customMediaBlocks: [],
    });
    expect(css).toContain('.rect_a1b2:hover');
    expect(css).toMatch(/:hover[^}]*box-shadow:\s*0px 4px 8px rgba\(0, 0, 0, 0\.15\);/);

    const { elements: parsed } = parseCode(tsx, css);
    expect(parsed['a1b2']?.stateOverrides?.hover?.boxShadows).toEqual([
      SHADOW_A,
    ]);
  });

  it('emits box-shadow: none to explicitly clear an inherited shadow', () => {
    const elements = {
      [ROOT_ELEMENT_ID]: makeRoot(['a1b2']),
      a1b2: makeRect('a1b2', {
        boxShadows: [SHADOW_A],
        stateOverrides: {
          hover: {
            boxShadows: [],
          },
        },
      }),
    };
    const { tsx, css } = generateCode({
      elements,
      rootId: ROOT_ELEMENT_ID,
      pageName: 'home',
      breakpoints: DEFAULT_BREAKPOINTS,
      customMediaBlocks: [],
    });
    expect(css).toMatch(/:hover[^}]*box-shadow:\s*none;/);

    const { elements: parsed } = parseCode(tsx, css);
    expect(parsed['a1b2']?.stateOverrides?.hover?.boxShadows).toEqual([]);
  });
});
