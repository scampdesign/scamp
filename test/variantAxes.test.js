import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { parseScampMeta } from '@lib/parseCode/tsx';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { DEFAULT_BREAKPOINTS } from '@shared/types';
/**
 * Variant axes: CONTRACT.md §1.3.1, and the contract-2 Button fixture as
 * the exact shape. see docs/plans/component-variants-plan.md
 */
const BUTTON_DIR = resolve(__dirname, '../node_modules/scampjs/fixtures/contract-2/components/Button');
const fixture = {
    tsx: readFileSync(resolve(BUTTON_DIR, 'Button.tsx'), 'utf-8'),
    css: readFileSync(resolve(BUTTON_DIR, 'Button.module.css'), 'utf-8'),
};
const parse = (tsx, css) => parseCode(tsx, css, { breakpoints: DEFAULT_BREAKPOINTS, isComponent: true });
const regenerate = (tsx, css) => {
    const p = parse(tsx, css);
    return generate(p.elements, p.customMediaBlocks);
};
const generate = (elements, customMediaBlocks = []) => generateCode({
    elements,
    rootId: ROOT_ELEMENT_ID,
    pageName: 'Button',
    cssModuleImportName: 'Button',
    breakpoints: DEFAULT_BREAKPOINTS,
    customMediaBlocks,
    pageKeyframesBlocks: [],
    isComponent: true,
});
const elementByClass = (elements, suffix) => Object.values(elements).find((el) => el.id.endsWith(suffix));
describe('the contract-2 Button fixture', () => {
    it('round-trips byte for byte', () => {
        const out = regenerate(fixture.tsx, fixture.css);
        expect(out.tsx).toBe(fixture.tsx);
        expect(out.css).toBe(fixture.css);
    });
    it('reads both axes, in order, with their defaults', () => {
        const root = parse(fixture.tsx, fixture.css).elements[ROOT_ELEMENT_ID];
        expect(root?.variantAxes).toEqual([
            { prop: 'variant', values: ['default', 'outline', 'secondary'], defaultValue: 'default' },
            { prop: 'size', values: ['small', 'medium', 'large'], defaultValue: 'medium' },
        ]);
    });
    it('puts each rule on the element it styles, states inside their value', () => {
        const { elements } = parse(fixture.tsx, fixture.css);
        const root = elements[ROOT_ELEMENT_ID];
        expect(root?.variantOverrides?.['variant=outline']?.states?.hover).toBeDefined();
        expect(root?.variantOverrides?.['variant=secondary']).toBeDefined();
        expect(root?.customSelectorBlocks ?? []).toEqual([]);
        const label = elementByClass(elements, 'c1a1');
        expect(Object.keys(label?.variantOverrides ?? {}).sort()).toEqual(['size=large', 'size=small']);
    });
});
const TSX = `import styles from './Button.module.css';

type ButtonProps = {
  tone?: "plain" | "loud";
  label?: string;
  className?: string;
};

export default function Button({ tone = "plain", label = "Save", className }: ButtonProps) {
  return (
    <button data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`} type="button" data-tone={tone}>
      <span data-scamp-id="label_c1a1" className={styles.label_c1a1}>{label}</span>
    </button>
  );
}

export const _scamp = { contract: 2, events: [] } as const;
`;
const css = (...rules) => [`.root {\n  width: fit-content;\n  position: relative;\n  display: inline-flex;\n}`, `.label_c1a1 {\n  font-size: 1rem;\n}`, ...rules].join('\n\n') + '\n';
describe('rules the model doesn’t hold stay verbatim', () => {
    it('an undeclared axis', () => {
        const source = css(`.root[data-mood="calm"] {\n  opacity: 0.8;\n}`);
        const p = parse(TSX, source);
        expect(p.elements[ROOT_ELEMENT_ID]?.customSelectorBlocks).toEqual([
            { selector: '.root[data-mood="calm"]', body: '  opacity: 0.8;' },
        ]);
        // Kept with its anchor, the root, as any rule Scamp doesn't model is:
        // unchanged, and stable from the first save on.
        const once = regenerate(TSX, source);
        expect(once.css).toContain('.root[data-mood="calm"] {\n  opacity: 0.8;\n}');
        expect(regenerate(once.tsx, once.css)).toEqual(once);
    });
    it('an undeclared value, and the default value’s own rule', () => {
        const source = css(`.root[data-tone="quiet"] {\n  opacity: 0.5;\n}`, `.root[data-tone="plain"] {\n  opacity: 1;\n}`);
        const p = parse(TSX, source);
        expect(p.elements[ROOT_ELEMENT_ID]?.variantOverrides).toBeUndefined();
        expect(p.elements[ROOT_ELEMENT_ID]?.customSelectorBlocks).toHaveLength(2);
    });
    it('a rule that combines two axes, or puts a state before a descendant', () => {
        const source = css(`.root[data-tone="loud"][data-size="small"] {\n  opacity: 0.5;\n}`, `.root[data-tone="loud"]:hover .label_c1a1 {\n  color: red;\n}`);
        const p = parse(TSX, source);
        expect(p.elements[ROOT_ELEMENT_ID]?.customSelectorBlocks).toHaveLength(2);
        expect(p.elements[ROOT_ELEMENT_ID]?.variantOverrides).toBeUndefined();
    });
    it('an axis rule inside a breakpoint', () => {
        const source = css(`@media (max-width: 768px) {\n  .root[data-tone="loud"] {\n    opacity: 0.5;\n  }\n}`);
        const p = parse(TSX, source);
        expect(p.customMediaBlocks).toHaveLength(1);
        expect(regenerate(TSX, source).css).toBe(source);
    });
    it('a union prop the root doesn’t bind as data-<prop> is not an axis', () => {
        const unbound = TSX.replace(' data-tone={tone}', '');
        expect(parse(unbound, css()).elements[ROOT_ELEMENT_ID]?.variantAxes).toBeUndefined();
    });
});
describe('generating', () => {
    it('writes the union type and an axis rule from the model', () => {
        const source = css(`.root[data-tone="loud"] .label_c1a1 {\n  font-size: 1.5rem;\n}`);
        const out = regenerate(TSX, source);
        expect(out.tsx).toContain('tone?: "plain" | "loud";');
        expect(out.css).toBe(source);
    });
    it('drops a value’s rules when the value is removed from the axis', () => {
        const { elements } = parse(TSX, css(`.root[data-tone="loud"] {\n  opacity: 0.5;\n}`));
        const root = elements[ROOT_ELEMENT_ID];
        if (root === undefined)
            throw new Error('no root');
        const out = generate({ ...elements, [ROOT_ELEMENT_ID]: { ...root, variantAxes: [{ prop: 'tone', values: ['plain'], defaultValue: 'plain' }] } });
        expect(out.css).not.toContain('data-tone');
        expect(out.tsx).toContain('tone?: "plain";');
    });
    it('leaves a component with no axes exactly as before', () => {
        const plain = TSX.replace('  tone?: "plain" | "loud";\n', '').replace('tone = "plain", ', '').replace(' data-tone={tone}', '');
        const source = css();
        expect(regenerate(plain, source)).toEqual({ tsx: plain, css: source });
    });
});
describe('parseScampMeta', () => {
    it('reads a _scamp export with fields the contract added later', () => {
        expect(parseScampMeta("export const _scamp = { contract: 2, events: ['onClick'], axes: ['variant'] } as const;")).toEqual({
            contract: 2,
            events: ['onClick'],
        });
        expect(parseScampMeta('export default function X() { return null; }')).toBeNull();
    });
});
