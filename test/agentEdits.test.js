import { describe, it, expect } from 'vitest';
import { DEFAULT_BREAKPOINTS } from '@shared/types';
import { addElement, deleteElement, mergeThemeTokens, planExtraction, moveElement, parseDeclarationList, resolveElement, setAttributes, setStyles, setTag, setText, wrapElements, } from '@lib/agentEdits';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
/**
 * The Scamp Agent's edits. The property that matters most: whatever an
 * edit produces survives a save and reload unchanged — the round-trip
 * invariant, held for agent edits too.
 * see docs/plans/builtin-agent-plan.md
 */
const TSX = `<div data-scamp-id="root" className={styles.root}>
  <div data-scamp-id="a1b2" className={styles.card_a1b2}>
    <h2 data-scamp-id="c3d4" className={styles.text_c3d4}>Title</h2>
    <p data-scamp-id="e5f6" className={styles.text_e5f6}>Body</p>
  </div>
  <div data-scamp-id="b7c8" className={styles.rect_b7c8}></div>
</div>`;
const CSS = `.root {
  width: 100%;
  min-height: 100vh;
}
.card_a1b2 {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
}
.rect_b7c8 {
  width: 120px;
  height: 40px;
}`;
const context = () => ({
    elements: parseCode(TSX, CSS).elements,
    rootId: 'root',
    breakpoints: DEFAULT_BREAKPOINTS,
    isComponent: false,
});
const ok = (result) => {
    if (!result.ok)
        throw new Error(result.error);
    return result;
};
/** Save then reload: what's on disk must read back as the same model. */
const expectRoundTrip = (elements) => {
    const first = generateCode({ elements, rootId: 'root', pageName: 'P', breakpoints: DEFAULT_BREAKPOINTS });
    const reparsed = parseCode(first.tsx, first.css, { breakpoints: DEFAULT_BREAKPOINTS });
    const second = generateCode({
        elements: reparsed.elements,
        rootId: 'root',
        pageName: 'P',
        breakpoints: DEFAULT_BREAKPOINTS,
    });
    expect(second.css).toBe(first.css);
    expect(second.tsx).toBe(first.tsx);
};
const cssOf = (elements) => generateCode({ elements, rootId: 'root', pageName: 'P', breakpoints: DEFAULT_BREAKPOINTS }).css;
describe('resolveElement', () => {
    it('finds an element by id, by class name, and the root by name', () => {
        const ctx = context();
        expect(resolveElement(ctx, 'a1b2')?.id).toBe('a1b2');
        expect(resolveElement(ctx, 'card_a1b2')?.id).toBe('a1b2');
        expect(resolveElement(ctx, 'root')?.id).toBe('root');
    });
    it('returns null for anything else', () => {
        const ctx = context();
        expect(resolveElement(ctx, 'nope')).toBeNull();
        expect(resolveElement(ctx, '')).toBeNull();
        expect(resolveElement(ctx, 42)).toBeNull();
    });
});
describe('parseDeclarationList', () => {
    it('reads declarations, lowercasing the property', () => {
        expect(parseDeclarationList('Display: flex; gap: 12px !important')).toEqual([
            { prop: 'display', value: 'flex', important: false },
            { prop: 'gap', value: '12px', important: true },
        ]);
    });
    it('reads nothing as nothing', () => {
        expect(parseDeclarationList('')).toEqual([]);
    });
    it('refuses a selector or a nested rule', () => {
        expect(typeof parseDeclarationList('} .evil { color: red')).toBe('string');
        expect(typeof parseDeclarationList('&:hover { color: red }')).toBe('string');
    });
});
describe('setStyles', () => {
    it('sets typed values the panel can edit', () => {
        const result = ok(setStyles(context(), { element: 'card_a1b2', set: 'gap: 24px; background: #ffeedd' }));
        const card = result.elements['a1b2'];
        expect(card?.gap).toBe(24);
        expect(card?.backgroundColor).toBe('#ffeedd');
        expect(result.summary).toBe('Updated card_a1b2 — gap: 24px; background: #ffeedd;');
        expect(result.notes).toEqual([]);
        expectRoundTrip(result.elements);
    });
    it('keeps the declarations it was not asked to change', () => {
        const result = ok(setStyles(context(), { element: 'a1b2', set: 'gap: 24px' }));
        const card = result.elements['a1b2'];
        expect(card?.display).toBe('flex');
        expect(card?.flexDirection).toBe('column');
        expect(card?.padding).toEqual([16, 16, 16, 16]);
    });
    it('removes a declaration', () => {
        const result = ok(setStyles(context(), { element: 'a1b2', remove: ['padding'] }));
        expect(result.elements['a1b2']?.padding).toEqual([0, 0, 0, 0]);
        expect(cssOf(result.elements)).not.toMatch(/\.card_a1b2 \{[^}]*padding/);
    });
    it('says which values rendered but the panel cannot edit', () => {
        const result = ok(setStyles(context(), { element: 'a1b2', set: 'border-top-color: red' }));
        expect(result.elements['a1b2']?.customProperties['border-top-color']).toBe('red');
        expect(result.notes[0]).toContain('border-top-color');
    });
    it('writes to a breakpoint without touching the desktop styles', () => {
        const result = ok(setStyles(context(), { element: 'a1b2', set: 'gap: 4px', breakpoint: 'Mobile' }));
        const card = result.elements['a1b2'];
        expect(card?.gap).toBe(8);
        const mobile = DEFAULT_BREAKPOINTS.find((b) => b.label === 'Mobile');
        expect(card?.breakpointOverrides?.[mobile?.id ?? '']?.gap).toBe(4);
        expect(result.summary).toContain('at Mobile');
        expectRoundTrip(result.elements);
    });
    it('refuses a breakpoint the project does not have, and names the ones it does', () => {
        const result = setStyles(context(), { element: 'a1b2', set: 'gap: 4px', breakpoint: 'watch' });
        expect(result).toMatchObject({ ok: false });
        if (!result.ok)
            expect(result.error).toContain('Mobile');
    });
    it('refuses CSS it cannot read, an unknown element, and an empty change', () => {
        expect(setStyles(context(), { element: 'a1b2', set: '} .x { color: red' }).ok).toBe(false);
        expect(setStyles(context(), { element: 'nope', set: 'gap: 1px' }).ok).toBe(false);
        expect(setStyles(context(), { element: 'a1b2' }).ok).toBe(false);
    });
    it('leaves every other element exactly as it was', () => {
        const ctx = context();
        const result = ok(setStyles(ctx, { element: 'a1b2', set: 'gap: 24px' }));
        for (const id of ['root', 'c3d4', 'e5f6', 'b7c8']) {
            expect(result.elements[id]).toBe(ctx.elements[id]);
        }
    });
});
describe('addElement', () => {
    it('adds a text element at the end of a flex container', () => {
        const result = ok(addElement(context(), { parent: 'card_a1b2', text: 'Learn more', tag: 'a', name: 'cta', css: 'color: #0055ff' }));
        const added = Object.values(result.elements).find((el) => el.text === 'Learn more');
        expect(added?.type).toBe('text');
        expect(added?.tag).toBe('a');
        expect(added?.color).toBe('#0055ff');
        expect(result.elements['a1b2']?.childIds.at(-1)).toBe(added?.id);
        expect(result.summary).toMatch(/^Added <a> cta_[0-9a-f]{4} to card_a1b2$/);
        expect(result.notes).toEqual([]);
        expectRoundTrip(result.elements);
    });
    it('adds a container at a given position', () => {
        const result = ok(addElement(context(), { parent: 'a1b2', index: 0, css: 'height: 2px; background: #ccc' }));
        const first = result.elements['a1b2']?.childIds[0];
        expect(first).not.toBe('c3d4');
        expect(result.elements[first ?? '']?.type).toBe('rectangle');
        expectRoundTrip(result.elements);
    });
    it('starts from no declarations, not from the draw tool’s fixed size', () => {
        const result = ok(addElement(context(), { parent: 'a1b2' }));
        const id = result.touched[0] ?? '';
        expect(result.elements[id]?.widthMode).not.toBe('fixed');
    });
    it('warns when the parent does not lay out its children', () => {
        const result = ok(addElement(context(), { parent: 'b7c8', text: 'Hi' }));
        expect(result.notes[0]).toContain('isn’t a flex or grid container'.replace('’', "'"));
    });
    it('refuses a text element as a parent, and a tag the type does not allow', () => {
        expect(addElement(context(), { parent: 'c3d4', text: 'x' }).ok).toBe(false);
        expect(addElement(context(), { parent: 'a1b2', tag: 'img' }).ok).toBe(false);
    });
});
describe('setText', () => {
    it('replaces a text element’s words', () => {
        const result = ok(setText(context(), { element: 'c3d4', text: 'New title' }));
        expect(result.elements['c3d4']?.text).toBe('New title');
        expectRoundTrip(result.elements);
    });
    it('refuses a container, and points at its text', () => {
        const result = setText(context(), { element: 'a1b2', text: 'x' });
        expect(result).toMatchObject({ ok: false });
        if (!result.ok)
            expect(result.error).toContain('container');
    });
});
describe('setTag', () => {
    it('changes a tag within the element’s type', () => {
        const result = ok(setTag(context(), { element: 'a1b2', tag: 'article' }));
        expect(result.elements['a1b2']?.tag).toBe('article');
        expectRoundTrip(result.elements);
    });
    it('refuses a tag the type does not allow, and the root', () => {
        expect(setTag(context(), { element: 'c3d4', tag: 'section' }).ok).toBe(false);
        expect(setTag(context(), { element: 'root', tag: 'main' }).ok).toBe(false);
    });
});
describe('setAttributes', () => {
    it('sets and removes attributes', () => {
        const added = ok(setAttributes(context(), { element: 'a1b2', attributes: { title: 'Card', role: 'group' } }));
        expect(added.elements['a1b2']?.attributes).toMatchObject({ title: 'Card', role: 'group' });
        const removed = ok(setAttributes({ ...context(), elements: added.elements }, { element: 'a1b2', attributes: { role: null } }));
        expect(removed.elements['a1b2']?.attributes).toEqual({ title: 'Card' });
        expectRoundTrip(removed.elements);
    });
    it('refuses attributes Scamp manages, and event handlers', () => {
        for (const name of ['className', 'data-scamp-id', 'style', 'onClick', 'dangerouslySetInnerHTML']) {
            expect(setAttributes(context(), { element: 'a1b2', attributes: { [name]: 'x' } }).ok).toBe(false);
        }
    });
    it('refuses a value that is not a string', () => {
        expect(setAttributes(context(), { element: 'a1b2', attributes: { title: 3 } }).ok).toBe(false);
        expect(setAttributes(context(), { element: 'a1b2', attributes: 'title' }).ok).toBe(false);
    });
});
describe('moveElement', () => {
    it('moves an element into another container', () => {
        const result = ok(moveElement(context(), { element: 'e5f6', parent: 'root', index: 0 }));
        expect(result.elements['root']?.childIds[0]).toBe('e5f6');
        expect(result.elements['a1b2']?.childIds).toEqual(['c3d4']);
        expectRoundTrip(result.elements);
    });
    it('refuses to move an element into itself', () => {
        expect(moveElement(context(), { element: 'a1b2', parent: 'a1b2' }).ok).toBe(false);
    });
});
describe('wrapElements', () => {
    it('wraps siblings in a styled, named container', () => {
        const result = ok(wrapElements(context(), { elements: ['c3d4', 'e5f6'], tag: 'header', name: 'card head', css: 'display: flex; gap: 4px' }));
        const wrapperId = result.touched[0] ?? '';
        const wrapper = result.elements[wrapperId];
        expect(wrapper?.tag).toBe('header');
        expect(wrapper?.childIds).toEqual(['c3d4', 'e5f6']);
        expect(wrapper?.gap).toBe(4);
        expect(result.summary).toMatch(/^Wrapped 2 elements in card_head_[0-9a-f]{4}$/);
        expectRoundTrip(result.elements);
    });
    it('refuses elements that are not siblings', () => {
        expect(wrapElements(context(), { elements: ['c3d4', 'b7c8'] }).ok).toBe(false);
    });
    it('refuses the root and an empty list', () => {
        expect(wrapElements(context(), { elements: ['root'] }).ok).toBe(false);
        expect(wrapElements(context(), { elements: [] }).ok).toBe(false);
    });
});
describe('deleteElement', () => {
    it('removes an element and everything inside it', () => {
        const result = ok(deleteElement(context(), { element: 'card_a1b2' }));
        expect(result.elements['a1b2']).toBeUndefined();
        expect(result.elements['c3d4']).toBeUndefined();
        expect(result.elements['e5f6']).toBeUndefined();
        expect(result.elements['root']?.childIds).toEqual(['b7c8']);
        expect(result.summary).toBe('Deleted card_a1b2 and 2 elements inside it');
        expectRoundTrip(result.elements);
    });
    it('says a leaf has nothing inside it', () => {
        expect(ok(deleteElement(context(), { element: 'b7c8' })).summary).toBe('Deleted rect_b7c8');
    });
    it('refuses the root and an unknown element', () => {
        expect(deleteElement(context(), { element: 'root' }).ok).toBe(false);
        expect(deleteElement(context(), { element: 'nope' }).ok).toBe(false);
    });
});
describe('mergeThemeTokens', () => {
    const current = [
        { name: '--color-text', value: '#111111' },
        { name: '--color-bg', value: '#ffffff' },
    ];
    it('adds new tokens and changes existing ones', () => {
        const result = mergeThemeTokens(current, { '--color-text': '#222222', '--color-accent': '#ff6600' });
        if (typeof result === 'string')
            throw new Error(result);
        expect(result.added).toEqual(['--color-accent']);
        expect(result.changed).toEqual(['--color-text']);
        expect(result.tokens).toEqual([
            { name: '--color-text', value: '#222222' },
            { name: '--color-bg', value: '#ffffff' },
            { name: '--color-accent', value: '#ff6600' },
        ]);
    });
    it('reports a value already set as no change', () => {
        const result = mergeThemeTokens(current, { '--color-bg': '#ffffff' });
        if (typeof result === 'string')
            throw new Error(result);
        expect(result.added).toEqual([]);
        expect(result.changed).toEqual([]);
    });
    it('does not change the tokens it was given', () => {
        mergeThemeTokens(current, { '--color-text': '#000000' });
        expect(current[0]?.value).toBe('#111111');
    });
    it('refuses a bad name, a bad value, and a value that would end the declaration', () => {
        expect(typeof mergeThemeTokens(current, { 'color-text': '#000' })).toBe('string');
        expect(typeof mergeThemeTokens(current, { '--x': '' })).toBe('string');
        expect(typeof mergeThemeTokens(current, { '--x': 4 })).toBe('string');
        expect(typeof mergeThemeTokens(current, { '--x': 'red; } body { display: none' })).toBe('string');
    });
    it('refuses a shape that is not an object of tokens, and an empty one', () => {
        expect(typeof mergeThemeTokens(current, ['--x'])).toBe('string');
        expect(typeof mergeThemeTokens(current, null)).toBe('string');
        expect(typeof mergeThemeTokens(current, {})).toBe('string');
    });
});
describe('planExtraction', () => {
    it('plans a container into a component, with look-alikes', () => {
        expect(planExtraction(context(), { element: 'card_a1b2', name: 'Card', alsoReplace: ['b7c8'] }, [])).toEqual({
            id: 'a1b2',
            name: 'Card',
            replaceIds: ['b7c8'],
        });
    });
    it('refuses the root, a text element, and a name that is not PascalCase', () => {
        expect(typeof planExtraction(context(), { element: 'root', name: 'Page' }, [])).toBe('string');
        expect(typeof planExtraction(context(), { element: 'c3d4', name: 'Title' }, [])).toBe('string');
        expect(typeof planExtraction(context(), { element: 'a1b2', name: 'card' }, [])).toBe('string');
    });
    it('refuses a name that only differs in case from an existing component', () => {
        // On a case-insensitive disk these are one folder.
        expect(typeof planExtraction(context(), { element: 'a1b2', name: 'Card' }, ['CARD'])).toBe('string');
    });
    it('refuses a look-alike that does not exist or is the source', () => {
        expect(typeof planExtraction(context(), { element: 'a1b2', name: 'Card', alsoReplace: ['nope'] }, [])).toBe('string');
        expect(typeof planExtraction(context(), { element: 'a1b2', name: 'Card', alsoReplace: ['a1b2'] }, [])).toBe('string');
    });
});
