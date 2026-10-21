import { describe, it, expect } from 'vitest';

import { DEFAULT_BREAKPOINTS } from '@shared/types';
import { setAttributes, type AgentEditContext, type AgentEditResult } from '@lib/agentEdits';
import { editVariants } from '@lib/agentVariants';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';

/**
 * The agent's variant edits: each action checks first and says why it
 * can't, then edits as the properties panel does, and the result
 * survives a save and reload.
 */

const TSX = `import styles from './Chip.module.css';

type ChipProps = {
  className?: string;
};

export default function Chip({ className }: ChipProps) {
  return (
    <button data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <span data-scamp-id="a1b2" className={styles.label_a1b2}>Chip</span>
    </button>
  );
}
`;

const CSS = `.root {
  display: flex;
}

.label_a1b2 {
  color: #111111;
}
`;

const generate = (elements: AgentEditContext['elements']): { tsx: string; css: string } =>
  generateCode({ elements, rootId: 'root', pageName: 'Chip', breakpoints: DEFAULT_BREAKPOINTS, isComponent: true });

const context = (elements = parseCode(TSX, CSS, { breakpoints: DEFAULT_BREAKPOINTS, isComponent: true }).elements): AgentEditContext => ({
  elements,
  rootId: 'root',
  breakpoints: DEFAULT_BREAKPOINTS,
  isComponent: true,
});

const ok = (result: AgentEditResult): Extract<AgentEditResult, { ok: true }> => {
  if (!result.ok) throw new Error(result.error);
  return result;
};

const error = (result: AgentEditResult): string => {
  if (result.ok) throw new Error(`expected a refusal, got: ${result.summary}`);
  return result.error;
};

/** The label red in `outline`. */
const outlineRed = (ctx: AgentEditContext): AgentEditContext => {
  const label = ctx.elements['a1b2'];
  if (label === undefined) throw new Error('fixture has no label');
  return context({ ...ctx.elements, a1b2: { ...label, variantOverrides: { 'variant=outline': { color: '#ff0000' } } } });
};

/** A context whose component already has `variant: default | outline`. */
const withVariant = (): AgentEditContext =>
  context(ok(editVariants(context(), { action: 'add_property', property: 'variant', values: ['default', 'outline'] })).elements);

describe('editVariants: add_property', () => {
  it('adds an axis with the first value as the default, written as a union prop and a data attribute', () => {
    const result = ok(editVariants(context(), { action: 'add_property', property: 'size', values: ['medium', 'small'] }));
    expect(result.elements['root']?.variantAxes).toEqual([{ prop: 'size', values: ['medium', 'small'], defaultValue: 'medium' }]);
    const { tsx } = generate(result.elements);
    expect(tsx).toContain('size?: "medium" | "small"');
    expect(tsx).toContain('data-size={size}');
  });

  it('round-trips through save and reload', () => {
    const { elements } = withVariant();
    const first = generate(elements);
    const reparsed = parseCode(first.tsx, first.css, { breakpoints: DEFAULT_BREAKPOINTS, isComponent: true });
    expect(generate(reparsed.elements)).toEqual(first);
  });

  it('refuses fewer than two values, a bad value name, or a repeated one', () => {
    expect(error(editVariants(context(), { action: 'add_property', property: 'size', values: ['small'] }))).toContain('two or more');
    expect(error(editVariants(context(), { action: 'add_property', property: 'size', values: ['small', 'Large'] }))).toContain('"Large"');
    expect(error(editVariants(context(), { action: 'add_property', property: 'size', values: ['a', 'a'] }))).toBe(
      'Each value must have a different name.'
    );
  });

  it('refuses a property name already taken', () => {
    expect(error(editVariants(withVariant(), { action: 'add_property', property: 'variant', values: ['a', 'b'] }))).toContain(
      'already has a prop named variant'
    );
  });

  it('refuses more than 36 combinations', () => {
    const many = (prefix: string): string[] => Array.from({ length: 7 }, (_, i) => `${prefix}${i}`);
    const ctx = context(ok(editVariants(context(), { action: 'add_property', property: 'one', values: many('a') })).elements);
    expect(error(editVariants(ctx, { action: 'add_property', property: 'two', values: many('b') }))).toContain('49 combinations');
  });
});

describe('editVariants: values', () => {
  it('adds a value, as a copy of another when asked', () => {
    const result = ok(editVariants(outlineRed(withVariant()), { action: 'add_value', property: 'variant', value: 'ghost', copy_from: 'outline' }));
    expect(result.elements['root']?.variantAxes?.[0]?.values).toEqual(['default', 'outline', 'ghost']);
    expect(result.elements['a1b2']?.variantOverrides?.['variant=ghost']).toEqual({ color: '#ff0000' });
  });

  it('refuses to remove the default, or the last value but one', () => {
    expect(error(editVariants(withVariant(), { action: 'remove_value', property: 'variant', value: 'default' }))).toContain('is the default');
    expect(error(editVariants(withVariant(), { action: 'remove_value', property: 'variant', value: 'outline' }))).toContain(
      'Remove the property instead'
    );
  });

  it('makes a value the default and says when it already is', () => {
    const result = ok(editVariants(withVariant(), { action: 'make_default', property: 'variant', value: 'outline' }));
    expect(result.elements['root']?.variantAxes?.[0]).toEqual({ prop: 'variant', values: ['outline', 'default'], defaultValue: 'outline' });
    expect(error(editVariants(withVariant(), { action: 'make_default', property: 'variant', value: 'default' }))).toContain('already');
  });

  it('names the properties a component has when asked for one it lacks', () => {
    expect(error(editVariants(withVariant(), { action: 'add_value', property: 'size', value: 'small' }))).toBe(
      'No variant property "size". It has variant.'
    );
    expect(error(editVariants(context(), { action: 'add_value', property: 'size', value: 'small' }))).toContain('add_property');
  });

  it('removes a property with its styles', () => {
    const result = ok(editVariants(withVariant(), { action: 'remove_property', property: 'variant' }));
    expect(result.elements['root']?.variantAxes ?? []).toEqual([]);
    expect(generate(result.elements).tsx).not.toContain('data-variant');
  });
});

describe('editVariants: interactions', () => {
  it('adds a hover from a value, written as a second selector', () => {
    const result = ok(editVariants(outlineRed(withVariant()), { action: 'add_interaction', property: 'variant', trigger: 'hover', from: 'default', to: 'outline' }));
    expect(result.elements['root']?.variantInteractions).toEqual([{ axis: 'variant', from: 'default', trigger: 'hover', to: 'outline' }]);
    expect(generate(result.elements).css).toContain('.root[data-variant="default"]:hover .label_a1b2');
  });

  it('adds a click on an element by class name, and notes it needs the framework', () => {
    const result = ok(
      editVariants(withVariant(), { action: 'add_interaction', property: 'variant', trigger: 'click', from: '*', to: 'outline', target: 'label_a1b2' })
    );
    expect(result.elements['root']?.variantInteractions).toEqual([{ axis: 'variant', from: null, trigger: 'click', to: 'outline', target: 'a1b2' }]);
    expect(result.notes.join(' ')).toContain('Scamp framework');
  });

  it('refuses a hover into the default, an unknown trigger, and a target on anything but a click', () => {
    expect(error(editVariants(withVariant(), { action: 'add_interaction', property: 'variant', trigger: 'hover', to: 'default' }))).toContain(
      "can't change to the default"
    );
    expect(error(editVariants(withVariant(), { action: 'add_interaction', property: 'variant', trigger: 'swipe', to: 'outline' }))).toContain(
      '"trigger" must be one of'
    );
    expect(
      error(editVariants(withVariant(), { action: 'add_interaction', property: 'variant', trigger: 'hover', to: 'outline', target: 'a1b2' }))
    ).toContain('Only a click');
  });

  it('removes an interaction, and lists the ones there are when none matches', () => {
    const args = { action: 'add_interaction', property: 'variant', trigger: 'click', from: 'default', to: 'outline' };
    const added = context(ok(editVariants(withVariant(), args)).elements);
    expect(ok(editVariants(added, { ...args, action: 'remove_interaction' })).elements['root']?.variantInteractions).toBeUndefined();
    expect(error(editVariants(added, { ...args, action: 'remove_interaction', trigger: 'escape' }))).toBe(
      'No such interaction. The component has: click: variant default → outline.'
    );
  });
});

describe('editVariants: refusals', () => {
  it('works on a component only', () => {
    expect(error(editVariants({ ...context(), isComponent: false }, { action: 'add_property', property: 'v', values: ['a', 'b'] }))).toContain(
      'belong to a component'
    );
  });

  it('refuses an unknown action, or one without a property', () => {
    expect(error(editVariants(context(), { action: 'rename', property: 'variant' }))).toContain('"action" must be one of');
    expect(error(editVariants(context(), { action: 'add_value' }))).toContain('"property"');
  });
});

describe('setAttributes on a component instance', () => {
  it('sets and clears the instance’s props, not HTML attributes', () => {
    const page = parseCode(
      `<div data-scamp-id="root" className={styles.root}>\n  <Chip data-scamp-instance-id="inst_a1b2" />\n</div>`,
      '.root {\n  width: 100%;\n}\n',
      { breakpoints: DEFAULT_BREAKPOINTS }
    ).elements;
    const instance = Object.values(page).find((el) => el.type === 'component-instance');
    if (instance === undefined) throw new Error('fixture has no instance');
    const ctx: AgentEditContext = { elements: page, rootId: 'root', breakpoints: DEFAULT_BREAKPOINTS, isComponent: false };
    const set = ok(setAttributes(ctx, { element: instance.id, attributes: { variant: 'outline' } }));
    expect(set.elements[instance.id]?.propOverrides).toEqual({ variant: 'outline' });
    expect(set.elements[instance.id]?.attributes).toEqual(instance.attributes);
    const cleared = ok(setAttributes({ ...ctx, elements: set.elements }, { element: instance.id, attributes: { variant: null } }));
    expect(cleared.elements[instance.id]?.propOverrides).toEqual({});
  });
});
