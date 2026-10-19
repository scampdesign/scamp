import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { ROOT_ELEMENT_ID, type ScampElement, type VariantAxis } from '@lib/element';
import { layerVariants } from '@lib/stateCascade';
import { instanceVariantKeys } from '@lib/variantAxes';
import { lintView } from '@lib/viewLint';
import { setStyles, type AgentEditContext } from '@lib/agentEdits';
import { listComponents, type SnapshotInput } from '@lib/canvasSnapshot';
import { DEFAULT_BREAKPOINTS } from '@shared/types';

/**
 * Using variants: instances pick a value, the canvas draws it, checks
 * catch a value the component lacks, and the agent styles one value.
 * see docs/plans/component-variants-plan.md
 */

type Elements = Record<string, ScampElement>;

const BUTTON_DIR = resolve(__dirname, '../node_modules/scampjs/fixtures/contract-2/components/Button');
const button = (): Elements =>
  parseCode(
    readFileSync(resolve(BUTTON_DIR, 'Button.tsx'), 'utf-8'),
    readFileSync(resolve(BUTTON_DIR, 'Button.module.css'), 'utf-8'),
    { breakpoints: DEFAULT_BREAKPOINTS, isComponent: true }
  ).elements;

const AXES: VariantAxis[] = [
  { prop: 'variant', values: ['default', 'outline', 'secondary'], defaultValue: 'default' },
  { prop: 'size', values: ['small', 'medium', 'large'], defaultValue: 'medium' },
];

const PAGE_TSX = (attrs: string): string => `import styles from './home.module.css';
import Button from '@/components/Button/Button';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <Button data-scamp-instance-id="inst_a1b2"${attrs} />
    </div>
  );
}
`;
const PAGE_CSS = `.root {\n  width: 100%;\n  min-height: 100vh;\n  position: relative;\n}\n`;

const page = (attrs: string): Elements =>
  parseCode(PAGE_TSX(attrs), PAGE_CSS, { breakpoints: DEFAULT_BREAKPOINTS }).elements;

const instanceOf = (elements: Elements): ScampElement | undefined =>
  Object.values(elements).find((el) => el.type === 'component-instance');

describe('instanceVariantKeys', () => {
  it('picks each axis’s value in axis order', () => {
    expect(instanceVariantKeys(AXES, { size: 'small', variant: 'outline' })).toEqual(['variant=outline', 'size=small']);
  });

  it('picks nothing for a default, a missing prop, or a value the axis lacks', () => {
    expect(instanceVariantKeys(AXES, { variant: 'default', size: 'huge' })).toEqual([]);
    expect(instanceVariantKeys(AXES, undefined)).toEqual([]);
    expect(instanceVariantKeys([], { variant: 'outline' })).toEqual([]);
  });
});

describe('layerVariants', () => {
  const el = (): ScampElement => ({
    ...(button()[ROOT_ELEMENT_ID] as ScampElement),
    opacity: 1,
    variantOverrides: {
      'variant=outline': { opacity: 0.8, states: { hover: { opacity: 0.1 } } },
      'size=small': { opacity: 0.6 },
    },
  });

  it('layers each picked value; a later axis wins, as its rule comes later', () => {
    expect(layerVariants(el(), ['variant=outline']).opacity).toBe(0.8);
    expect(layerVariants(el(), ['variant=outline', 'size=small']).opacity).toBe(0.6);
  });

  it('leaves states out, and is the element itself with nothing picked', () => {
    const base = el();
    expect(layerVariants(base, [])).toBe(base);
    expect(layerVariants(base, ['variant=secondary'])).toBe(base);
  });
});

describe('an instance’s variant in the page file', () => {
  it('reads and writes as a plain attribute', () => {
    const elements = page(' variant="outline" size="small"');
    expect(instanceOf(elements)?.propOverrides).toEqual({ variant: 'outline', size: 'small' });
    const { tsx } = generateCode({ elements, rootId: ROOT_ELEMENT_ID, pageName: 'home', breakpoints: DEFAULT_BREAKPOINTS });
    expect(tsx).toContain('variant="outline"');
    expect(tsx).toContain('size="small"');
  });
});

describe('checks', () => {
  const roots = (): Record<string, ScampElement | undefined> => ({ Button: button()[ROOT_ELEMENT_ID] });
  const kinds = (elements: Elements, componentRoots: Record<string, ScampElement | undefined>): string[] =>
    lintView({ elements, rootId: ROOT_ELEMENT_ID, themeTokens: [], componentRoots })
      .map((f) => f.kind)
      .filter((kind) => kind.includes('variant'));

  it('a value the component lacks is a problem that names the values', () => {
    const findings = lintView({ elements: page(' variant="ghost"'), rootId: ROOT_ELEMENT_ID, themeTokens: [], componentRoots: roots() });
    expect(findings.map((f) => [f.kind, f.severity])).toEqual([['unknown-variant-value', 'problem']]);
    expect(findings[0]?.hint).toBe('Use one of `default`, `outline`, `secondary`, or add `ghost` to the component.');
  });

  it('a declared value, or no axes known, is fine', () => {
    expect(kinds(page(' variant="outline" size="large"'), roots())).toEqual([]);
    expect(kinds(page(' variant="ghost"'), {})).toEqual([]);
  });

  it('a component rule for an undeclared value is a problem', () => {
    const css = readFileSync(resolve(BUTTON_DIR, 'Button.module.css'), 'utf-8') + `\n.root[data-variant="ghost"] {\n  opacity: 0.5;\n}\n`;
    const elements = parseCode(readFileSync(resolve(BUTTON_DIR, 'Button.tsx'), 'utf-8'), css, {
      breakpoints: DEFAULT_BREAKPOINTS,
      isComponent: true,
    }).elements;
    expect(kinds(elements, {})).toEqual(['undeclared-variant-rule']);
    expect(kinds(button(), {})).toEqual([]);
  });
});

describe('scamp_set_styles with a variant', () => {
  const ctx = (): AgentEditContext => ({ elements: button(), rootId: ROOT_ELEMENT_ID, breakpoints: DEFAULT_BREAKPOINTS, isComponent: true });
  const label = (elements: Elements): ScampElement | undefined => Object.values(elements).find((el) => el.id.endsWith('c1a1'));

  it('styles the root in one value, leaving the base and other values alone', () => {
    const before = ctx();
    const result = setStyles(before, { element: 'root', set: 'opacity: 0.5', variant: 'secondary' });
    if (!result.ok) throw new Error(result.error);
    const root = result.elements[ROOT_ELEMENT_ID];
    expect(root?.variantOverrides?.['variant=secondary']?.opacity).toBe(0.5);
    expect(root?.opacity).toBe(before.elements[ROOT_ELEMENT_ID]?.opacity);
    expect(root?.variantOverrides?.['variant=outline']).toEqual(before.elements[ROOT_ELEMENT_ID]?.variantOverrides?.['variant=outline']);
    expect(result.summary).toContain('in variant secondary');
  });

  it('styles a child as axis=value, adding a rule the value didn’t have', () => {
    const result = setStyles(ctx(), { element: 'label_c1a1', set: 'opacity: 0.25', variant: 'variant=outline' });
    if (!result.ok) throw new Error(result.error);
    expect(label(result.elements)?.variantOverrides?.['variant=outline']?.opacity).toBe(0.25);
    expect(label(result.elements)?.variantOverrides?.['size=small']).toEqual(label(button())?.variantOverrides?.['size=small']);
  });

  it('removes a declaration from a value', () => {
    const set = setStyles(ctx(), { element: 'root', set: 'opacity: 0.5', variant: 'large' });
    if (!set.ok) throw new Error(set.error);
    const removed = setStyles({ ...ctx(), elements: set.elements }, { element: 'root', remove: ['opacity'], variant: 'large' });
    if (!removed.ok) throw new Error(removed.error);
    expect(removed.elements[ROOT_ELEMENT_ID]?.variantOverrides?.['size=large']?.opacity).toBeUndefined();
  });

  it('refuses the default, an unknown value, a breakpoint with it, and a view without variants', () => {
    const errorOf = (args: Parameters<typeof setStyles>[1], context = ctx()): string => {
      const r = setStyles(context, args);
      return r.ok ? '' : r.error;
    };
    expect(errorOf({ element: 'root', set: 'opacity: 0.5', variant: 'default' })).toContain('is the default variant');
    expect(errorOf({ element: 'root', set: 'opacity: 0.5', variant: 'ghost' })).toBe(
      'No variant value "ghost". This component has variant: default, outline, secondary; size: small, medium, large.'
    );
    expect(errorOf({ element: 'root', set: 'opacity: 0.5', variant: 'outline', breakpoint: 'Mobile' })).toContain('desktop only');
    const plain: AgentEditContext = { ...ctx(), elements: page('') };
    expect(errorOf({ element: 'root', set: 'opacity: 0.5', variant: 'outline' }, plain)).toContain('has no variants');
  });
});

describe('scamp_list_components', () => {
  it('lists a component’s axes, and nothing for one without', () => {
    const elements = button();
    const input = {
      componentNames: ['Button', 'Card'],
      trees: { Button: { kind: 'component', elements, rootId: ROOT_ELEMENT_ID } },
    } as unknown as SnapshotInput;
    const [listedButton, listedCard] = listComponents(input);
    expect(listedButton?.variants).toEqual([
      { prop: 'variant', values: ['default', 'outline', 'secondary'], default: 'default' },
      { prop: 'size', values: ['small', 'medium', 'large'], default: 'medium' },
    ]);
    expect(listedCard?.variants).toBeUndefined();
  });
});
