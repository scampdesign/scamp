import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { ROOT_ELEMENT_ID, keysCovering, orderedVariantKeys, variantKeyParts, type ScampElement, type VariantAxis } from '@lib/element';
import { layerVariants, resolveElementAtState } from '@lib/stateCascade';
import {
  MAX_VARIANT_COMBINATIONS,
  addVariantAxis,
  addVariantValue,
  instanceVariantKeys,
  isVariantKeyLive,
  makeVariantDefault,
  moveVariantValue,
  variantGrid,
  removeVariantAxis,
  removeVariantValue,
  renameVariantAxis,
  renameVariantValue,
  variantCombinationCount,
} from '@lib/variantAxes';
import { applyPatchWithAxisRouting } from '@store/canvas/patchRouting';
import { DEFAULT_BREAKPOINTS } from '@shared/types';

/**
 * Combination rules: `.root[data-variant="outline"][data-size="small"]`,
 * written by an edit in a frame that combines two values.
 * see docs/plans/component-variants-plan.md, phase 6
 */

type Elements = Record<string, ScampElement>;

const BUTTON_DIR = resolve(__dirname, '../node_modules/scampjs/fixtures/contract-2/components/Button');
const TSX = readFileSync(resolve(BUTTON_DIR, 'Button.tsx'), 'utf-8');
const CSS = readFileSync(resolve(BUTTON_DIR, 'Button.module.css'), 'utf-8');

const parse = (css: string): Elements =>
  parseCode(TSX, css, { breakpoints: DEFAULT_BREAKPOINTS, isComponent: true }).elements;

const generate = (elements: Elements): { tsx: string; css: string } =>
  generateCode({
    elements,
    rootId: ROOT_ELEMENT_ID,
    pageName: 'Button',
    cssModuleImportName: 'Button',
    breakpoints: DEFAULT_BREAKPOINTS,
    customMediaBlocks: [],
    pageKeyframesBlocks: [],
    isComponent: true,
  });

const COMBO = `.root[data-variant="outline"][data-size="small"] {\n  opacity: 0.5;\n}\n\n.root[data-variant="outline"][data-size="small"] .label_c1a1 {\n  font-weight: 700;\n}\n\n.root[data-variant="outline"][data-size="small"] .label_c1a1:hover {\n  opacity: 0.8;\n}\n`;
const withCombo = `${CSS}\n${COMBO}`;

const root = (elements: Elements): ScampElement | undefined => elements[ROOT_ELEMENT_ID];
const label = (elements: Elements): ScampElement | undefined => Object.values(elements).find((el) => el.id.endsWith('c1a1'));

const AXES: VariantAxis[] = [
  { prop: 'variant', values: ['default', 'outline', 'secondary'], defaultValue: 'default' },
  { prop: 'size', values: ['small', 'medium', 'large'], defaultValue: 'medium' },
];

describe('keys', () => {
  it('orders every key the axes allow: singles, then pairs, as the rules are written', () => {
    expect(orderedVariantKeys(AXES)).toEqual([
      'variant=outline',
      'variant=secondary',
      'size=small',
      'size=large',
      'variant=outline&size=small',
      'variant=outline&size=large',
      'variant=secondary&size=small',
      'variant=secondary&size=large',
    ]);
  });

  it('lists the keys a set of picks reaches, in the same order', () => {
    const picks = [
      { axis: 'variant', value: 'outline' },
      { axis: 'size', value: 'small' },
      { axis: 'tone', value: 'loud' },
    ];
    expect(keysCovering(picks)).toEqual([
      'variant=outline',
      'size=small',
      'tone=loud',
      'variant=outline&size=small',
      'variant=outline&tone=loud',
      'size=small&tone=loud',
      'variant=outline&size=small&tone=loud',
    ]);
  });

  it('reads a key’s parts, and refuses a malformed one', () => {
    expect(variantKeyParts('variant=outline&size=small')).toEqual([
      { axis: 'variant', value: 'outline' },
      { axis: 'size', value: 'small' },
    ]);
    expect(variantKeyParts('variant=outline&size')).toBeNull();
    expect(variantKeyParts('')).toBeNull();
  });

  it('a combination is live when each part is a non-default value, in axis order', () => {
    const elements = parse(CSS);
    expect(isVariantKeyLive(elements, 'variant=outline&size=small')).toBe(true);
    expect(isVariantKeyLive(elements, 'size=small&variant=outline')).toBe(false);
    expect(isVariantKeyLive(elements, 'variant=outline&size=medium')).toBe(false);
    expect(isVariantKeyLive(elements, 'variant=outline&variant=secondary')).toBe(false);
  });
});

describe('reading and writing a combination rule', () => {
  it('round-trips byte for byte, with the rules on their elements', () => {
    const elements = parse(withCombo);
    expect(root(elements)?.variantOverrides?.['variant=outline&size=small']).toEqual({ opacity: 0.5 });
    expect(label(elements)?.variantOverrides?.['variant=outline&size=small']).toEqual({ fontWeight: 700, states: { hover: { opacity: 0.8 } } });
    expect(root(elements)?.customSelectorBlocks ?? []).toEqual([]);
    expect(generate(elements).css).toBe(withCombo);
  });

  it('writes combinations after every single value', () => {
    const out = generate(parse(withCombo)).css;
    expect(out.indexOf('[data-size="large"] .label_c1a1')).toBeLessThan(out.indexOf('[data-variant="outline"][data-size="small"]'));
  });

  it.each([
    ['axes out of order', '.root[data-size="small"][data-variant="outline"]'],
    ['a default value', '.root[data-variant="outline"][data-size="medium"]'],
    ['an undeclared value', '.root[data-variant="ghost"][data-size="small"]'],
    ['one axis twice', '.root[data-variant="outline"][data-variant="secondary"]'],
  ])('keeps %s verbatim', (_case, selector) => {
    const elements = parse(`${CSS}\n${selector} {\n  opacity: 0.5;\n}\n`);
    expect(root(elements)?.customSelectorBlocks).toEqual([{ selector, body: '  opacity: 0.5;' }]);
  });
});

describe('drawing a combination', () => {
  const el = (): ScampElement => ({
    ...(root(parse(CSS)) as ScampElement),
    opacity: 1,
    variantOverrides: {
      'variant=outline': { opacity: 0.9, states: { hover: { opacity: 0.6 } } },
      'size=small': { opacity: 0.8 },
      'variant=outline&size=small': { opacity: 0.7 },
    },
  });

  it('layers each value, then the combination, as the browser’s cascade does', () => {
    expect(resolveElementAtState(el(), 'desktop', DEFAULT_BREAKPOINTS, null, 'variant=outline&size=small').opacity).toBe(0.7);
  });

  it('a single value’s state is written before the combination, so the combination wins', () => {
    expect(resolveElementAtState(el(), 'desktop', DEFAULT_BREAKPOINTS, 'hover', 'variant=outline&size=small').opacity).toBe(0.7);
    expect(resolveElementAtState(el(), 'desktop', DEFAULT_BREAKPOINTS, 'hover', 'variant=outline').opacity).toBe(0.6);
  });

  it('an instance picking both values reaches the combination', () => {
    const keys = instanceVariantKeys(AXES, { variant: 'outline', size: 'small' });
    expect(layerVariants(el(), keys).opacity).toBe(0.7);
  });
});

describe('editing in a combination frame', () => {
  it('routes the edit to the combination and writes its rule', () => {
    const elements = parse(CSS);
    const edited = { ...elements, [ROOT_ELEMENT_ID]: applyPatchWithAxisRouting(root(elements) as ScampElement, { opacity: 0.4 }, 'desktop', null, 'variant=secondary&size=large') };
    expect(generate(edited).css).toContain('.root[data-variant="secondary"][data-size="large"] {\n  opacity: 0.4;\n}');
  });
});

describe('axis edits reach combinations', () => {
  const keysOn = (elements: Elements): string[] => Object.keys(root(elements)?.variantOverrides ?? {}).sort();

  it('renaming a value renames it inside combinations', () => {
    expect(keysOn(renameVariantValue(parse(withCombo), 'size', 'small', 'tiny'))).toContain('variant=outline&size=tiny');
  });

  it('renaming an axis renames it inside combinations', () => {
    expect(keysOn(renameVariantAxis(parse(withCombo), 'variant', 'look'))).toContain('look=outline&size=small');
  });

  it('removing a value drops the combinations that name it', () => {
    const removed = removeVariantValue(parse(withCombo), 'size', 'small');
    expect(keysOn(removed).some((k) => k.includes('size=small'))).toBe(false);
    expect(keysOn(removed)).toContain('variant=outline');
  });

  it('removing an axis drops its combinations and keeps the other axis’s values', () => {
    const removed = removeVariantAxis(parse(withCombo), 'size');
    expect(keysOn(removed)).toEqual(['variant=outline', 'variant=secondary']);
    expect(label(removed)?.variantOverrides).toBeUndefined();
  });
});

describe('the combination limit', () => {
  it('counts the frames the axes make', () => {
    expect(variantCombinationCount(AXES)).toBe(9);
    expect(variantCombinationCount([])).toBe(1);
  });

  it('refuses a value or an axis past the limit, and allows one up to it', () => {
    const elements = parse(CSS);
    // 3 × 3 × 4 = 36 is allowed; a fifth tone value would make 45.
    const toned = addVariantAxis(elements, { prop: 'tone', values: ['a', 'b', 'c', 'd'], defaultValue: 'a' });
    expect(variantCombinationCount(root(toned)?.variantAxes ?? [])).toBe(MAX_VARIANT_COMBINATIONS);
    expect(addVariantValue(toned, 'tone', 'e', null)).toBe(toned);
    expect(addVariantAxis(elements, { prop: 'tone', values: ['a', 'b', 'c', 'd', 'e'], defaultValue: 'a' })).toBe(elements);
  });
});

describe('makeVariantDefault', () => {
  /** Every element's look, for every combination and state, keyed for comparison. */
  const looks = (elements: Elements): Record<string, unknown> => {
    const axes = root(elements)?.variantAxes ?? [];
    let picks: Array<Record<string, string>> = [{}];
    for (const axis of axes) picks = picks.flatMap((p) => axis.values.map((v) => ({ ...p, [axis.prop]: v })));
    const out: Record<string, unknown> = {};
    for (const pick of picks) {
      const parts = axes.filter((a) => pick[a.prop] !== a.defaultValue).map((a) => `${a.prop}=${pick[a.prop]}`);
      const key = parts.length === 0 ? null : parts.join('&');
      for (const state of [null, 'hover'] as const) {
        for (const [id, el] of Object.entries(elements)) {
          const drawn = resolveElementAtState(el, 'desktop', DEFAULT_BREAKPOINTS, state, key);
          const { variantOverrides: _v, stateOverrides: _s, variantAxes: _a, attributes: _at, ...look } = drawn;
          out[`${JSON.stringify(pick)}|${state}|${id}`] = look;
        }
      }
    }
    return out;
  };

  it('moves the value to the front as the default, and every look stays the same', () => {
    const before = parse(withCombo);
    const after = makeVariantDefault(before, 'variant', 'outline');
    expect(root(after)?.variantAxes?.[0]).toEqual({ prop: 'variant', values: ['outline', 'default', 'secondary'], defaultValue: 'outline' });
    expect(root(after)?.attributes?.['data-variant']).toBe('outline');
    expect(looks(after)).toEqual(looks(before));
  });

  it('writes the new default’s look as the base rules, and survives a save and reload', () => {
    const after = makeVariantDefault(parse(withCombo), 'variant', 'outline');
    const { tsx, css } = generate(after);
    expect(tsx).toContain('variant = "outline"');
    expect(css).toMatch(/\.root \{[^}]*background: transparent;/);
    expect(css).toContain('.root[data-variant="default"]');
    const reloaded = parseCode(tsx, css, { breakpoints: DEFAULT_BREAKPOINTS, isComponent: true }).elements;
    expect(looks(reloaded)).toEqual(looks(after));
  });

  it('making the old default the default again gives the same looks back', () => {
    const before = parse(withCombo);
    const back = makeVariantDefault(makeVariantDefault(before, 'size', 'large'), 'size', 'medium');
    expect(looks(back)).toEqual(looks(before));
  });

  it('leaves the files alone for the current default or an unknown value', () => {
    const elements = parse(CSS);
    expect(makeVariantDefault(elements, 'variant', 'default')).toBe(elements);
    expect(makeVariantDefault(elements, 'variant', 'ghost')).toBe(elements);
  });
});

describe('variantGrid', () => {
  it('puts the first axis down the rows and the second across, every combination a frame', () => {
    const [block] = variantGrid(AXES);
    expect(block?.heading).toBeNull();
    expect(block?.rows.map((row) => row.map((c) => c.key))).toEqual([
      ['size=small', null, 'size=large'],
      ['variant=outline&size=small', 'variant=outline', 'variant=outline&size=large'],
      ['variant=secondary&size=small', 'variant=secondary', 'variant=secondary&size=large'],
    ]);
    expect(block?.rows[1]?.[2]?.label).toBe('outline · large');
  });

  it('lays one axis out as a row', () => {
    expect(variantGrid([AXES[0] as VariantAxis]).map((b) => b.rows.map((r) => r.map((c) => c.key)))).toEqual([
      [[null, 'variant=outline', 'variant=secondary']],
    ]);
  });

  it('stacks one grid per value of a third axis, headed by it', () => {
    const blocks = variantGrid([...AXES, { prop: 'tone', values: ['calm', 'loud'], defaultValue: 'calm' }]);
    expect(blocks.map((b) => b.heading)).toEqual(['tone: calm', 'tone: loud']);
    expect(blocks[1]?.rows[0]?.[1]?.key).toBe('tone=loud');
    expect(blocks.flatMap((b) => b.rows.flat())).toHaveLength(18);
  });

  it('draws nothing without axes', () => {
    expect(variantGrid([])).toEqual([]);
  });
});

describe('moveVariantValue', () => {
  it('reorders a value, which reorders the rules written', () => {
    const moved = moveVariantValue(parse(CSS), 'variant', 'secondary', 1);
    expect(root(moved)?.variantAxes?.[0]?.values).toEqual(['default', 'secondary', 'outline']);
    const css = generate(moved).css;
    expect(css.indexOf('[data-variant="secondary"]')).toBeLessThan(css.indexOf('[data-variant="outline"]'));
  });

  it('leaves the files alone for no move or an unknown value', () => {
    const elements = parse(CSS);
    expect(moveVariantValue(elements, 'variant', 'outline', 1)).toBe(elements);
    expect(moveVariantValue(elements, 'variant', 'ghost', 0)).toBe(elements);
  });
});
