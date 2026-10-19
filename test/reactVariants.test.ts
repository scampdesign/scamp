import { describe, it, expect } from 'vitest';

import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID, type ScampElement } from '@lib/element';
import { MAX_VARIANT_VALUES, paintOverride, planReactVariants, slugValue, type VariantCopy } from '@lib/reactVariants';

/** A React component's looks as variants. see docs/plans/component-variants-plan.md */

const el = (overrides: Partial<ScampElement> = {}): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  id: 'b1',
  type: 'rectangle',
  parentId: ROOT_ELEMENT_ID,
  childIds: [],
  x: 0,
  y: 0,
  customProperties: {},
  ...overrides,
});

const LOOK = [el({ backgroundColor: '#2563eb' })];
const copy = (view: string, props: VariantCopy['props'], paint: Partial<ScampElement> = {}): VariantCopy => ({
  view,
  props,
  elements: [el({ backgroundColor: '#2563eb', ...paint })],
});

describe('planReactVariants', () => {
  it('is null when every copy paints the same', () => {
    expect(planReactVariants([copy('Home', {}), copy('About', {})], LOOK)).toBeNull();
  });

  it('is null when copies differ only in what isn’t paint', () => {
    const dated = { ...copy('Home', {}), elements: [el({ backgroundColor: '#2563eb', attributes: { datetime: '2026-10-19' } })] };
    expect(planReactVariants([dated, copy('About', {})], LOOK)).toBeNull();
  });

  it('names the axis and its values after a string prop that tells the looks apart', () => {
    const plan = planReactVariants(
      [
        copy('Home', { variant: 'primary', label: 'Save' }),
        copy('Home', { variant: 'Outline', label: 'Cancel' }, { backgroundColor: 'transparent' }),
        copy('About', { variant: 'primary', label: 'Go' }),
      ],
      LOOK
    );
    expect(plan).toEqual({
      kind: 'variants',
      axis: { prop: 'variant', values: ['primary', 'outline'], defaultValue: 'primary' },
      copyValues: ['primary', 'outline', 'primary'],
      overrides: { outline: { 0: { backgroundColor: 'transparent' } } },
      named: 'prop',
    });
  });

  it('names a look after the boolean prop that turns it on', () => {
    const plan = planReactVariants(
      [copy('Home', { isActive: true }, { backgroundColor: '#dbe8f6' }), copy('Home', { isActive: false }), copy('About', { isActive: false })],
      LOOK
    );
    expect(plan?.kind === 'variants' && plan.axis).toEqual({ prop: 'variant', values: ['default', 'active'], defaultValue: 'default' });
  });

  it('skips a prop the component already has', () => {
    const copies = [copy('Home', { tone: 'calm' }), copy('About', { tone: 'loud' }, { color: '#ff0000' })];
    const plan = planReactVariants(copies, LOOK, new Set(['tone']));
    expect(plan?.kind === 'variants' && plan.named).toBe('view');
  });

  it('names one look per page after its page', () => {
    const plan = planReactVariants(
      [copy('Home', {}, { color: '#111111' }), copy('PricingPlans', {}, { color: '#222222' }), copy('Team', {}, { color: '#333333' })],
      LOOK
    );
    // No copy is in the common look, so the default is a value no instance picks.
    expect(plan?.kind === 'variants' && plan.axis).toEqual({
      prop: 'variant',
      values: ['default', 'home', 'pricing-plans', 'team'],
      defaultValue: 'default',
    });
    expect(plan?.kind === 'variants' && plan.copyValues).toEqual(['home', 'pricing-plans', 'team']);
  });

  it('numbers the looks when nothing names them', () => {
    const plan = planReactVariants(
      [copy('Home', {}), copy('Home', {}, { color: '#111111' }), copy('Home', {}, { color: '#222222' })],
      LOOK
    );
    expect(plan?.kind === 'variants' && [plan.axis.values, plan.named]).toEqual([['default', 'variant-2', 'variant-3'], 'number']);
  });

  it('gives up past the cap: a component painted per page isn’t a set of variants', () => {
    const copies = Array.from({ length: MAX_VARIANT_VALUES + 1 }, (_, i) => copy('Home', {}, { color: `#00000${i}` }));
    expect(planReactVariants(copies, LOOK)).toEqual({ kind: 'too-many', looks: MAX_VARIANT_VALUES + 1 });
  });
});

describe('paintOverride', () => {
  it('carries the paint fields and paint CSS that differ, and nothing else', () => {
    const look = el({ color: '#000000', customProperties: { cursor: 'pointer', gap: '4px' } });
    const copyEl = el({ color: '#ff0000', visibilityMode: 'hidden', customProperties: { cursor: 'default', gap: '8px', filter: 'blur(2px)' } });
    expect(paintOverride(copyEl, look)).toEqual({ color: '#ff0000', customProperties: { cursor: 'default', filter: 'blur(2px)' } });
  });
});

describe('slugValue', () => {
  it('makes a value CSS and TypeScript both accept', () => {
    expect(slugValue('Outline')).toBe('outline');
    expect(slugValue('extraLarge')).toBe('extra-large');
    expect(slugValue('  Two words! ')).toBe('two-words');
    expect(slugValue('2xl')).toBe('v-2xl');
    expect(slugValue('***')).toBe('');
  });
});
