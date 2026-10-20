import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { resolveElementAtState } from '@lib/stateCascade';
import { addVariantAxis, addVariantValue, isVariantKeyLive, nextValueName, parseVariantKey, removeVariantAxis, removeVariantValue, renameVariantAxis, renameVariantValue, resetVariantFields, variantAxisError, variantOverrideFields, variantValueError, } from '@lib/variantAxes';
import { applyPatchWithAxisRouting } from '@store/canvas/patchRouting';
import { DEFAULT_BREAKPOINTS } from '@shared/types';
const BUTTON_DIR = resolve(__dirname, '../node_modules/scampjs/fixtures/contract-2/components/Button');
const fixture = {
    tsx: readFileSync(resolve(BUTTON_DIR, 'Button.tsx'), 'utf-8'),
    css: readFileSync(resolve(BUTTON_DIR, 'Button.module.css'), 'utf-8'),
};
const parse = (tsx, css) => parseCode(tsx, css, { breakpoints: DEFAULT_BREAKPOINTS, isComponent: true }).elements;
const generate = (elements) => generateCode({
    elements,
    rootId: ROOT_ELEMENT_ID,
    pageName: 'Button',
    cssModuleImportName: 'Button',
    breakpoints: DEFAULT_BREAKPOINTS,
    customMediaBlocks: [],
    pageKeyframesBlocks: [],
    isComponent: true,
});
/** Write the files and read them back, as a save and reload does. */
const roundTrip = (elements) => {
    const { tsx, css } = generate(elements);
    return parse(tsx, css);
};
const PLAIN_TSX = `import styles from './Card.module.css';

type CardProps = {
  label?: string;
  className?: string;
};

export default function Card({ label = "Save", className }: CardProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <span data-scamp-id="label_c1a1" className={styles.label_c1a1}>{label}</span>
    </div>
  );
}

export const _scamp = { contract: 2, events: [] } as const;
`;
const PLAIN_CSS = `.root {\n  width: fit-content;\n  position: relative;\n  display: flex;\n}\n\n.label_c1a1 {\n  font-size: 1rem;\n}\n`;
const button = () => parse(fixture.tsx, fixture.css);
const plain = () => parse(PLAIN_TSX, PLAIN_CSS);
const root = (elements) => elements[ROOT_ELEMENT_ID];
const label = (elements) => Object.values(elements).find((el) => el.id.endsWith('c1a1'));
describe('addVariantAxis', () => {
    it('binds the axis on the root, and the files read back the same axis', () => {
        const added = addVariantAxis(plain(), { prop: 'tone', values: ['plain', 'loud'], defaultValue: 'plain' });
        expect(root(added)?.bind).toEqual({ 'data-tone': 'tone' });
        expect(root(added)?.attributes?.['data-tone']).toBe('plain');
        const { tsx } = generate(added);
        expect(tsx).toContain('tone?: "plain" | "loud";');
        expect(tsx).toContain('data-tone={tone}');
        expect(root(roundTrip(added))?.variantAxes).toEqual([{ prop: 'tone', values: ['plain', 'loud'], defaultValue: 'plain' }]);
    });
    it('refuses a name that is taken or not an identifier', () => {
        const elements = plain();
        expect(addVariantAxis(elements, { prop: 'label', values: ['a'], defaultValue: 'a' })).toBe(elements);
        expect(addVariantAxis(elements, { prop: 'Tone', values: ['a'], defaultValue: 'a' })).toBe(elements);
        expect(addVariantAxis(elements, { prop: 'tone', values: ['a'], defaultValue: 'b' })).toBe(elements);
    });
});
describe('addVariantValue', () => {
    it('starts as a copy of the value it was added from', () => {
        const added = addVariantValue(button(), 'variant', 'ghost', 'outline');
        expect(root(added)?.variantAxes?.[0]?.values).toEqual(['default', 'outline', 'secondary', 'ghost']);
        expect(root(added)?.variantOverrides?.['variant=ghost']).toEqual(root(added)?.variantOverrides?.['variant=outline']);
        expect(root(added)?.variantOverrides?.['variant=ghost']).not.toBe(root(added)?.variantOverrides?.['variant=outline']);
    });
    it('starts as the base look when added from the default', () => {
        const added = addVariantValue(button(), 'variant', 'ghost', 'default');
        expect(root(added)?.variantOverrides?.['variant=ghost']).toBeUndefined();
        expect(root(roundTrip(added))?.variantAxes?.[0]?.values).toContain('ghost');
    });
    it('refuses a duplicate or a name CSS and TypeScript can’t both hold', () => {
        const elements = button();
        expect(addVariantValue(elements, 'variant', 'outline', null)).toBe(elements);
        expect(addVariantValue(elements, 'variant', 'Big Red', null)).toBe(elements);
        expect(addVariantValue(elements, 'missing', 'ghost', null)).toBe(elements);
    });
});
describe('renameVariantValue', () => {
    it('moves the overrides to the new name and writes them under it', () => {
        const renamed = renameVariantValue(button(), 'variant', 'outline', 'ghost');
        expect(root(renamed)?.variantOverrides?.['variant=outline']).toBeUndefined();
        expect(root(renamed)?.variantOverrides?.['variant=ghost']?.states?.hover).toBeDefined();
        const { css } = generate(renamed);
        expect(css).toContain('.root[data-variant="ghost"]');
        expect(css).not.toContain('outline"]');
    });
    it('renaming the default renames the destructure default too', () => {
        const renamed = renameVariantValue(button(), 'size', 'medium', 'regular');
        expect(root(renamed)?.variantAxes?.[1]).toEqual({ prop: 'size', values: ['small', 'regular', 'large'], defaultValue: 'regular' });
        expect(generate(renamed).tsx).toContain('size = "regular"');
        expect(root(roundTrip(renamed))?.variantAxes?.[1]?.defaultValue).toBe('regular');
    });
});
describe('removeVariantValue', () => {
    it('drops the value and every rule for it', () => {
        const removed = removeVariantValue(button(), 'size', 'small');
        expect(root(removed)?.variantAxes?.[1]?.values).toEqual(['medium', 'large']);
        expect(Object.keys(label(removed)?.variantOverrides ?? {})).toEqual(['size=large']);
        expect(generate(removed).css).not.toContain('data-size="small"');
    });
    it('keeps the default value', () => {
        const elements = button();
        expect(removeVariantValue(elements, 'variant', 'default')).toBe(elements);
    });
});
describe('an axis down to one value', () => {
    it('still reads back as an axis', () => {
        const one = removeVariantValue(removeVariantValue(button(), 'variant', 'outline'), 'variant', 'secondary');
        const { tsx } = generate(one);
        expect(tsx).toContain('variant?: "default";');
        expect(root(roundTrip(one))?.variantAxes?.[0]).toEqual({ prop: 'variant', values: ['default'], defaultValue: 'default' });
    });
});
describe('renameVariantAxis and removeVariantAxis', () => {
    it('renames the prop, the attribute, and the keys', () => {
        const renamed = renameVariantAxis(button(), 'size', 'scale');
        expect(root(renamed)?.bind?.['data-scale']).toBe('scale');
        expect(root(renamed)?.bind?.['data-size']).toBeUndefined();
        expect(Object.keys(label(renamed)?.variantOverrides ?? {}).sort()).toEqual(['scale=large', 'scale=small']);
        expect(root(roundTrip(renamed))?.variantAxes?.map((a) => a.prop)).toEqual(['variant', 'scale']);
    });
    it('removes the axis, its binding, and its overrides', () => {
        const removed = removeVariantAxis(button(), 'size');
        expect(root(removed)?.variantAxes?.map((a) => a.prop)).toEqual(['variant']);
        expect(root(removed)?.bind?.['data-size']).toBeUndefined();
        expect(root(removed)?.attributes?.['data-size']).toBeUndefined();
        expect(label(removed)?.variantOverrides).toBeUndefined();
        const { tsx, css } = generate(removed);
        expect(tsx).not.toContain('size');
        expect(css).not.toContain('data-size');
    });
    it('removing the last axis leaves a component without variants', () => {
        const removed = removeVariantAxis(removeVariantAxis(button(), 'size'), 'variant');
        expect(root(removed)?.variantAxes).toBeUndefined();
        expect(root(removed)?.variantOverrides).toBeUndefined();
    });
});
describe('names and keys', () => {
    it('parses a key, and refuses one without both halves', () => {
        expect(parseVariantKey('variant=outline')).toEqual({ axis: 'variant', value: 'outline' });
        expect(parseVariantKey('variant=')).toBeNull();
        expect(parseVariantKey('=outline')).toBeNull();
        expect(parseVariantKey('variant')).toBeNull();
    });
    it('a key is live only for a non-default value of a declared axis', () => {
        const elements = button();
        expect(isVariantKeyLive(elements, 'variant=outline')).toBe(true);
        expect(isVariantKeyLive(elements, 'variant=default')).toBe(false);
        expect(isVariantKeyLive(elements, 'variant=ghost')).toBe(false);
        expect(isVariantKeyLive(plain(), 'variant=outline')).toBe(false);
    });
    it('suggests the next free value name', () => {
        expect(nextValueName({ prop: 'variant', values: ['default', 'variant-3'], defaultValue: 'default' })).toBe('variant-4');
        expect(nextValueName({ prop: 'size', values: ['small', 'size-3', 'large'], defaultValue: 'small' })).toBe('size-4');
    });
    it('explains a bad name', () => {
        const axis = { prop: 'variant', values: ['default', 'outline'], defaultValue: 'default' };
        expect(variantValueError(axis, 'ghost')).toBeNull();
        expect(variantValueError(axis, 'outline')).toBe('variant already has a value named outline.');
        expect(variantValueError(axis, 'outline', 'outline')).toBeNull();
        expect(variantValueError(axis, '')).not.toBeNull();
        expect(variantAxisError(button(), 'label')).toBe('The component already has a prop named label.');
        expect(variantAxisError(button(), 'variant', 'variant')).toBeNull();
        expect(variantAxisError(button(), 'children')).toBe('children is reserved by React or JavaScript.');
        // A keyword can't be a destructured binding, and React strips `key` and `ref`.
        // see docs/audits/2026-10-20-repo-audit.md, finding 17
        for (const name of ['class', 'for', 'default', 'key', 'ref', 'style']) {
            expect(variantAxisError(button(), name)).toBe(`${name} is reserved by React or JavaScript.`);
        }
        // CSS matches `data-` attributes lowercase, so a camelCase axis wouldn't read back.
        expect(variantAxisError(button(), 'isOpen')).toBe('Use lowercase letters and digits, starting with a letter.');
    });
});
describe('routing a patch into a variant', () => {
    const el = () => {
        const found = root(button());
        if (found === undefined)
            throw new Error('fixture has no root');
        return found;
    };
    it('a style edit lands in the value, not the base', () => {
        const base = el();
        const next = applyPatchWithAxisRouting(base, { opacity: 0.5 }, 'desktop', null, 'variant=outline');
        expect(next.opacity).toBe(base.opacity);
        expect(next.variantOverrides?.['variant=outline']?.opacity).toBe(0.5);
        expect(next.variantOverrides?.['variant=outline']?.states?.hover).toEqual(base.variantOverrides?.['variant=outline']?.states?.hover);
    });
    it('with a state, it lands in that state inside the value', () => {
        const next = applyPatchWithAxisRouting(el(), { opacity: 0.25 }, 'desktop', 'active', 'variant=outline');
        expect(next.variantOverrides?.['variant=outline']?.states?.active?.opacity).toBe(0.25);
        expect(next.stateOverrides?.active).toBeUndefined();
    });
    it('merges custom properties into the value’s own', () => {
        const once = applyPatchWithAxisRouting(el(), { customProperties: { gap: '4px' } }, 'desktop', null, 'size=small');
        const twice = applyPatchWithAxisRouting(once, { customProperties: { outline: 'none' } }, 'desktop', null, 'size=small');
        expect(twice.variantOverrides?.['size=small']?.customProperties).toMatchObject({ gap: '4px', outline: 'none' });
    });
    it('identity fields still land on the element', () => {
        const next = applyPatchWithAxisRouting(el(), { name: 'cta', opacity: 0.5 }, 'desktop', null, 'variant=outline');
        expect(next.name).toBe('cta');
        expect(next.variantOverrides?.['variant=outline']?.opacity).toBe(0.5);
    });
    it('an instance inside the component keeps the edit on its own styles, which are written', () => {
        const instance = { ...el(), id: 'i1', type: 'component-instance', componentName: 'Icon', opacity: 1 };
        const next = applyPatchWithAxisRouting(instance, { opacity: 0.5 }, 'desktop', null, 'variant=outline');
        expect(next.opacity).toBe(0.5);
        expect(next.variantOverrides).toEqual(instance.variantOverrides);
    });
    it('a variant at another breakpoint drops the style edit', () => {
        const base = el();
        const next = applyPatchWithAxisRouting(base, { opacity: 0.5 }, 'tablet', null, 'variant=outline');
        expect(next).toEqual(base);
    });
    it('the edit writes as the value’s rule', () => {
        const elements = button();
        const edited = { ...elements, [ROOT_ELEMENT_ID]: applyPatchWithAxisRouting(el(), { opacity: 0.5 }, 'desktop', null, 'variant=secondary') };
        expect(generate(edited).css).toMatch(/\.root\[data-variant="secondary"\] \{[^}]*opacity: 0\.5;/);
    });
});
describe('resolveElementAtState with a variant', () => {
    const withLayers = () => ({
        ...root(button()),
        opacity: 1,
        stateOverrides: { hover: { opacity: 0.9 } },
        variantOverrides: { 'variant=outline': { opacity: 0.8, states: { hover: { opacity: 0.7 } } } },
    });
    it('draws the value over the base', () => {
        expect(resolveElementAtState(withLayers(), 'desktop', DEFAULT_BREAKPOINTS, null, 'variant=outline').opacity).toBe(0.8);
    });
    it('the value outranks the base state, and its own state outranks both, as in CSS', () => {
        const el = withLayers();
        const { hover: _hover, ...noValueHover } = el.variantOverrides?.['variant=outline']?.states ?? {};
        const valueOnly = { ...el, variantOverrides: { 'variant=outline': { opacity: 0.8, states: noValueHover } } };
        expect(resolveElementAtState(valueOnly, 'desktop', DEFAULT_BREAKPOINTS, 'hover', 'variant=outline').opacity).toBe(0.8);
        expect(resolveElementAtState(el, 'desktop', DEFAULT_BREAKPOINTS, 'hover', 'variant=outline').opacity).toBe(0.7);
    });
    it('without a variant, nothing changes', () => {
        const el = withLayers();
        expect(resolveElementAtState(el, 'desktop', DEFAULT_BREAKPOINTS, null, null)).toBe(el);
        expect(resolveElementAtState(el, 'desktop', DEFAULT_BREAKPOINTS, null, 'variant=ghost')).toBe(el);
    });
});
describe('resetting a variant’s fields', () => {
    const el = () => ({
        ...root(button()),
        variantOverrides: { 'variant=outline': { opacity: 0.8, fontWeight: 700, states: { hover: { opacity: 0.7 } } } },
    });
    it('lists and clears the fields the value overrides', () => {
        expect(variantOverrideFields(el(), 'variant=outline', null).sort()).toEqual(['fontWeight', 'opacity']);
        const reset = resetVariantFields(el(), 'variant=outline', null, ['opacity']);
        expect(reset.variantOverrides?.['variant=outline']).toEqual({ fontWeight: 700, states: { hover: { opacity: 0.7 } } });
    });
    it('clears a state inside the value, and prunes what empties', () => {
        expect(variantOverrideFields(el(), 'variant=outline', 'hover')).toEqual(['opacity']);
        const reset = resetVariantFields(el(), 'variant=outline', 'hover', ['opacity']);
        expect(reset.variantOverrides?.['variant=outline']).toEqual({ opacity: 0.8, fontWeight: 700 });
        const empty = resetVariantFields(resetVariantFields(reset, 'variant=outline', null, ['fontWeight', 'opacity']), 'variant=outline', null, []);
        expect(empty.variantOverrides).toBeUndefined();
    });
    it('an element without the value is unchanged', () => {
        const plainRoot = root(plain());
        expect(resetVariantFields(plainRoot, 'variant=outline', null, ['opacity'])).toBe(plainRoot);
        expect(variantOverrideFields(undefined, 'variant=outline', null)).toEqual([]);
    });
});
