import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { ROOT_ELEMENT_ID, removeSubtree } from '@lib/element';
import { addVariantInteraction, aliasSelectors, interactionError, readInteractionAttributes, removeVariantInteraction, withInteractionAttributes, } from '@lib/variantInteractions';
import { addVariantValue, makeVariantDefault, removeVariantValue, renameVariantAxis, renameVariantValue } from '@lib/variantAxes';
import { starterFiles } from '@lib/starterComponents';
import { lintView } from '@lib/viewLint';
import { DEFAULT_BREAKPOINTS } from '@shared/types';
const BUTTON_DIR = resolve(__dirname, '../node_modules/scampjs/fixtures/contract-2/components/Button');
const TSX = readFileSync(resolve(BUTTON_DIR, 'Button.tsx'), 'utf-8');
const CSS = readFileSync(resolve(BUTTON_DIR, 'Button.module.css'), 'utf-8');
const parse = (tsx, css) => parseCode(tsx, css, { breakpoints: DEFAULT_BREAKPOINTS, isComponent: true }).elements;
const generate = (elements, name = 'Button') => generateCode({
    elements,
    rootId: ROOT_ELEMENT_ID,
    pageName: name,
    cssModuleImportName: name,
    breakpoints: DEFAULT_BREAKPOINTS,
    customMediaBlocks: [],
    pageKeyframesBlocks: [],
    isComponent: true,
});
const button = () => parse(TSX, CSS);
const root = (elements) => elements[ROOT_ELEMENT_ID];
const HOVER = { axis: 'variant', from: 'default', trigger: 'hover', to: 'outline' };
describe('hover, press, and focus as second selectors', () => {
    it('gives each rule of the value changed to a second selector, from the starting value', () => {
        const { css } = generate(addVariantInteraction(button(), HOVER));
        expect(css).toContain('.root[data-variant="outline"],\n.root[data-variant="default"]:hover {');
        expect(css).toContain('.root[data-variant="outline"]:hover,\n.root[data-variant="default"]:hover:hover {');
        // Rules of other values don't change.
        expect(css).toContain('\n.root[data-variant="secondary"] {');
    });
    it('a combination keeps its other values in the second selector', () => {
        const withCombo = parse(TSX, `${CSS}\n.root[data-variant="outline"][data-size="small"] {\n  opacity: 0.5;\n}\n`);
        const { css } = generate(addVariantInteraction(withCombo, HOVER));
        expect(css).toContain('.root[data-variant="outline"][data-size="small"],\n.root[data-variant="default"][data-size="small"]:hover {');
    });
    it('from any value keeps the axis with no value, as specific as the rules it has to beat', () => {
        // `.root:active .x` would tie with `.root[data-state="closed"] .x`,
        // written later, and lose to it in the browser.
        expect(aliasSelectors('root', [{ axis: 'state', value: 'pressed' }], ' .label_c1a1', [
            { axis: 'state', from: null, trigger: 'press', to: 'pressed' },
        ])).toEqual(['.root[data-state]:active .label_c1a1']);
        expect(aliasSelectors('root', [{ axis: 'state', value: 'on' }], '', [{ axis: 'state', from: 'off', trigger: 'focus', to: 'on' }])).toEqual([
            '.root[data-state="off"]:focus-visible',
        ]);
    });
    it('reads back as the same interactions, and writes the same files again', () => {
        const once = generate(addVariantInteraction(addVariantInteraction(button(), HOVER), { axis: 'size', from: null, trigger: 'press', to: 'large' }));
        const parsed = parse(once.tsx, once.css);
        expect(root(parsed)?.variantInteractions).toEqual([HOVER, { axis: 'size', from: null, trigger: 'press', to: 'large' }]);
        expect(root(parsed)?.customSelectorBlocks ?? []).toEqual([]);
        expect(generate(parsed)).toEqual(once);
    });
    it('an interaction into a value nothing styles yet is kept, on an empty rule', () => {
        // The Next.js Modal: no click interactions of its own to read back.
        const files = starterFiles('Modal', 'Modal', 'nextjs');
        const modal = parse(files.tsx, files.css);
        const withValue = addVariantValue(modal, 'state', 'peek', null);
        const hover = { axis: 'state', from: 'open', trigger: 'hover', to: 'peek' };
        const once = generate(addVariantInteraction(withValue, hover), 'Modal');
        expect(once.css).toContain('.root[data-state="peek"],\n.root[data-state="open"]:hover {\n}');
        const parsed = parse(once.tsx, once.css);
        expect(root(parsed)?.variantInteractions).toEqual([hover]);
        expect(root(parsed)?.variantOverrides?.['state=peek']).toBeUndefined();
        expect(generate(parsed, 'Modal')).toEqual(once);
    });
    it('reads any value back from the second selector', () => {
        const anyHover = { axis: 'variant', from: null, trigger: 'hover', to: 'outline' };
        const once = generate(addVariantInteraction(button(), anyHover));
        expect(once.css).toContain('.root[data-variant="outline"],\n.root[data-variant]:hover {');
        expect(root(parse(once.tsx, once.css))?.variantInteractions).toEqual([anyHover]);
    });
    it.each([
        ['a different rest', '.root[data-variant="outline"],\n.root[data-variant="default"]:hover .label_c1a1'],
        ['two values swapped', '.root[data-variant="outline"][data-size="small"],\n.root[data-variant="default"][data-size="large"]:hover'],
        ['an undeclared starting value', '.root[data-variant="outline"],\n.root[data-variant="ghost"]:hover'],
        ['an unknown pseudo-class', '.root[data-variant="outline"],\n.root[data-variant="default"]:focus-within'],
    ])('keeps a list with %s verbatim', (_case, selector) => {
        const elements = parse(TSX, `${CSS}\n${selector} {\n  opacity: 0.5;\n}\n`);
        expect(root(elements)?.variantInteractions).toBeUndefined();
        expect(root(elements)?.customSelectorBlocks?.map((b) => b.selector)).toContain(selector);
    });
});
describe('click, outside, and Escape as attributes', () => {
    const menu = () => {
        const files = starterFiles('Menu', 'Menu', 'nextjs');
        return parse(files.tsx, files.css);
    };
    const OPEN = { axis: 'state', from: 'closed', trigger: 'click', to: 'open', target: 'e51a' };
    const CLOSE = { axis: 'state', from: 'open', trigger: 'click', to: 'closed', target: 'e51a' };
    const OUTSIDE = { axis: 'state', from: 'open', trigger: 'outside', to: 'closed' };
    const ESCAPE = { axis: 'state', from: null, trigger: 'escape', to: 'closed' };
    const interactive = () => [OPEN, CLOSE, OUTSIDE, ESCAPE].reduce(addVariantInteraction, menu());
    it('writes click on the element clicked, outside and Escape on the root', () => {
        const { tsx } = generate(interactive(), 'Menu');
        expect(tsx).toMatch(/data-scamp-id="trigger_e51a"[^>]*data-scamp-click="state:closed=open,open=closed"/);
        expect(tsx).toMatch(/data-scamp-id="root"[^>]*data-scamp-outside="state:open=closed" data-scamp-escape="state:\*=closed"/);
    });
    it('reads back as the same interactions, and the same files', () => {
        const once = generate(interactive(), 'Menu');
        const parsed = parse(once.tsx, once.css);
        // Read in element order; for these, order doesn't matter.
        expect(root(parsed)?.variantInteractions).toHaveLength(4);
        expect(root(parsed)?.variantInteractions).toEqual(expect.arrayContaining([OPEN, CLOSE, OUTSIDE, ESCAPE]));
        expect(Object.values(parsed).some((el) => Object.keys(el.attributes ?? {}).some((a) => a.startsWith('data-scamp-click')))).toBe(false);
        expect(generate(parsed, 'Menu')).toEqual(once);
    });
    it('leaves a malformed attribute as an ordinary attribute', () => {
        const elements = { ...menu() };
        const rootEl = elements[ROOT_ELEMENT_ID];
        elements[ROOT_ELEMENT_ID] = { ...rootEl, attributes: { ...rootEl.attributes, 'data-scamp-outside': 'not a spec' } };
        const read = readInteractionAttributes(elements);
        expect(read.interactions).toEqual([]);
        expect(read.elements[ROOT_ELEMENT_ID]?.attributes?.['data-scamp-outside']).toBe('not a spec');
    });
    it('removing the element clicked removes its click, and nothing else', () => {
        // see docs/audits/2026-10-20-repo-audit.md, finding 16
        const removed = removeSubtree(interactive(), 'e51a');
        expect(root(removed?.elements ?? {})?.variantInteractions).toEqual([OUTSIDE, ESCAPE]);
    });
    it('skips a click whose element is gone', () => {
        const gone = addVariantInteraction(menu(), { ...OPEN, target: 'nope' });
        expect(Object.values(withInteractionAttributes(gone)).some((el) => el.attributes?.['data-scamp-click'] !== undefined)).toBe(false);
    });
});
describe('editing interactions', () => {
    it('refuses a value the axis lacks, the same value, and a CSS trigger into the default', () => {
        const axes = root(button())?.variantAxes ?? [];
        expect(interactionError(axes, HOVER)).toBeNull();
        expect(interactionError(axes, { ...HOVER, to: 'ghost' })).toBe('variant has no value named ghost.');
        expect(interactionError(axes, { ...HOVER, from: 'outline' })).toBe('Choose a different value to change to.');
        expect(interactionError(axes, { ...HOVER, from: 'outline', to: 'default' })).toContain("can't change to the default");
        expect(interactionError(axes, { ...HOVER, from: 'outline', to: 'default', trigger: 'click' })).toBeNull();
    });
    it('a second interaction for the same trigger and starting value replaces the first', () => {
        const twice = addVariantInteraction(addVariantInteraction(button(), HOVER), { ...HOVER, to: 'secondary' });
        expect(root(twice)?.variantInteractions).toEqual([{ ...HOVER, to: 'secondary' }]);
        expect(root(removeVariantInteraction(twice, HOVER))?.variantInteractions).toEqual([{ ...HOVER, to: 'secondary' }]);
        expect(root(removeVariantInteraction(twice, { ...HOVER, to: 'secondary' }))?.variantInteractions).toBeUndefined();
    });
    it('follows a rename, and goes with a removed value', () => {
        const withHover = addVariantInteraction(button(), HOVER);
        expect(root(renameVariantValue(withHover, 'variant', 'outline', 'ghost'))?.variantInteractions).toEqual([{ ...HOVER, to: 'ghost' }]);
        expect(root(renameVariantAxis(withHover, 'variant', 'look'))?.variantInteractions).toEqual([{ ...HOVER, axis: 'look' }]);
        expect(root(removeVariantValue(withHover, 'variant', 'outline'))?.variantInteractions).toBeUndefined();
    });
    it('a hover into a value made the default goes, as nothing can carry it', () => {
        const withHover = addVariantInteraction(button(), HOVER);
        expect(root(makeVariantDefault(withHover, 'variant', 'outline'))?.variantInteractions).toBeUndefined();
        expect(root(makeVariantDefault(withHover, 'variant', 'secondary'))?.variantInteractions).toEqual([HOVER]);
    });
});
describe('checks', () => {
    const findings = (elements) => lintView({ elements, rootId: ROOT_ELEMENT_ID, themeTokens: [] })
        .filter((f) => f.kind === 'variant-interaction')
        .map((f) => f.message);
    const withInteractions = (list, base = button()) => {
        const r = base[ROOT_ELEMENT_ID];
        return { ...base, [ROOT_ELEMENT_ID]: { ...r, variantInteractions: list } };
    };
    it('names an interaction to a value the property lacks', () => {
        expect(findings(withInteractions([{ ...HOVER, to: 'ghost' }]))).toEqual(['While hovering: variant has no value named ghost.']);
    });
    it('says when a pressed look comes before the hover look that would win', () => {
        const list = [
            { axis: 'variant', from: 'default', trigger: 'hover', to: 'secondary' },
            { axis: 'variant', from: 'default', trigger: 'press', to: 'outline' },
        ];
        expect(findings(withInteractions(list))).toEqual([
            'While pressing shows outline, but secondary comes after it, so the hover look wins while pressing.',
        ]);
        expect(findings(withInteractions([list[1], { ...list[0], to: 'outline' }]))).toEqual([]);
    });
    it('says when a click is on an element the keyboard can’t reach', () => {
        const files = starterFiles('Menu', 'Menu', 'nextjs');
        const menu = parse(files.tsx, files.css);
        const onButton = { axis: 'state', from: 'closed', trigger: 'click', to: 'open', target: 'e51a' };
        expect(findings(withInteractions([onButton], menu))).toEqual([]);
        expect(findings(withInteractions([{ ...onButton, target: 'e51b' }], menu))).toEqual([
            'The click on `panel_e51b` can’t be reached from the keyboard.'.replace('’', "'"),
        ]);
    });
});
