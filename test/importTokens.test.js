import { describe, it, expect } from 'vitest';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { extractTokens, normalizeColor, resolveTokenNames, } from '@lib/importTokens';
/**
 * Lifting an imported page's repeated colours into tokens.
 *
 * The bar is not "extracts tokens" — it is "extracts tokens a person
 * would keep". A theme full of `--color-11` is worse than no theme, so
 * most of these cases are about what it declines to name.
 * see docs/plans/website-import-plan.md
 */
const el = (id, over = {}) => ({
    ...DEFAULT_RECT_STYLES,
    id,
    type: 'rectangle',
    parentId: ROOT_ELEMENT_ID,
    childIds: [],
    x: 0,
    y: 0,
    widthMode: 'auto',
    heightMode: 'auto',
    customProperties: {},
    inlineFragments: [],
    ...over,
});
const tree = (...elements) => Object.fromEntries(elements.map((e) => [e.id, e]));
const namesOf = (r) => r.tokens.map((t) => t.name).sort();
describe('normalizeColor', () => {
    it.each([
        ['rgb(45, 74, 124)', '#2d4a7c'],
        ['rgb(0, 0, 0)', '#000000'],
        ['#FFF', '#ffffff'],
        ['#2D4A7C', '#2d4a7c'],
        ['  rgb(1,2,3)  ', '#010203'],
    ])('reads %j as %j', (input, expected) => {
        expect(normalizeColor(input)).toBe(expected);
    });
    it('keeps a translucent colour as rgba, which the panel can read', () => {
        // Hex-with-alpha is not what the colour control takes.
        expect(normalizeColor('rgba(0, 0, 0, 0.45)')).toBe('rgba(0, 0, 0, 0.45)');
    });
    it('returns null for anything that is not a colour', () => {
        for (const input of ['', 'transparent', 'var(--x)', 'linear-gradient(red, blue)', 'notacolor']) {
            expect(normalizeColor(input)).toBeNull();
        }
    });
});
describe('extractTokens — what it declines to do', () => {
    it('names nothing when no value repeats', () => {
        const result = extractTokens(tree(el('a', { color: 'rgb(1, 1, 1)' }), el('b', { color: 'rgb(2, 2, 2)' })));
        expect(result.tokens).toEqual([]);
        // …and hands the elements back untouched, not merely equal.
        expect(result.elements['a']?.color).toBe('rgb(1, 1, 1)');
    });
    it('ignores transparent, which is an absence rather than a colour', () => {
        const result = extractTokens(tree(el('a', { backgroundColor: 'transparent' }), el('b', { backgroundColor: 'transparent' }), el('c', { backgroundColor: 'transparent' })));
        expect(result.tokens).toEqual([]);
    });
    it('leaves a value that is already a token alone', () => {
        const result = extractTokens(tree(el('a', { color: 'var(--color-ink)' }), el('b', { color: 'var(--color-ink)' })));
        expect(result.tokens).toEqual([]);
        expect(result.elements['b']?.color).toBe('var(--color-ink)');
    });
    it('caps how many it will name, so a photo page cannot write a hundred', () => {
        const many = Array.from({ length: 40 }, (_, i) => [el(`a${i}`, { color: `rgb(${i}, 0, 0)` }), el(`b${i}`, { color: `rgb(${i}, 0, 0)` })]).flat();
        const result = extractTokens(tree(...many), { maxTokens: 6 });
        expect(result.tokens).toHaveLength(6);
    });
    it('honours a stricter threshold', () => {
        const els = tree(el('a', { color: 'rgb(9, 9, 9)' }), el('b', { color: 'rgb(9, 9, 9)' }));
        expect(extractTokens(els, { minUses: 3 }).tokens).toEqual([]);
        expect(extractTokens(els, { minUses: 2 }).tokens).toHaveLength(1);
    });
});
describe('extractTokens — naming by role', () => {
    it('names the most-used text colour for what it is', () => {
        const result = extractTokens(tree(el('a', { color: 'rgb(26, 29, 36)' }), el('b', { color: 'rgb(26, 29, 36)' }), el('c', { color: 'rgb(26, 29, 36)' })));
        expect(namesOf(result)).toEqual(['--color-text']);
    });
    it('separates text, background and border', () => {
        const result = extractTokens(tree(el('a', { color: 'rgb(10, 10, 10)' }), el('b', { color: 'rgb(10, 10, 10)' }), el('c', { backgroundColor: 'rgb(250, 250, 250)' }), el('d', { backgroundColor: 'rgb(250, 250, 250)' }), 
        // A border colour only counts when there is a border to paint.
        el('e', { borderColor: 'rgb(220, 220, 220)', borderWidth: [1, 1, 1, 1], borderStyle: 'solid' }), el('f', { borderColor: 'rgb(220, 220, 220)', borderWidth: [1, 1, 1, 1], borderStyle: 'solid' })));
        expect(namesOf(result)).toEqual(['--color-background', '--color-border', '--color-text']);
    });
    it('names the saturated one an accent, even when it is used less', () => {
        // The colour a person reaches for first is rarely the commonest.
        const result = extractTokens(tree(el('a', { color: 'rgb(20, 20, 20)' }), el('b', { color: 'rgb(20, 20, 20)' }), el('c', { color: 'rgb(20, 20, 20)' }), el('d', { backgroundColor: 'rgb(220, 40, 40)' }), el('e', { backgroundColor: 'rgb(220, 40, 40)' })));
        expect(namesOf(result)).toContain('--color-accent');
    });
    it('counts a border colour only when there is a border', () => {
        const noBorder = extractTokens(tree(el('a', { borderColor: 'rgb(9, 9, 9)' }), el('b', { borderColor: 'rgb(9, 9, 9)' })));
        expect(noBorder.tokens).toEqual([]);
        const withBorder = extractTokens(tree(el('a', { borderColor: 'rgb(9, 9, 9)', borderWidth: [1, 1, 1, 1], borderStyle: 'solid' }), el('b', { borderColor: 'rgb(9, 9, 9)', borderWidth: [1, 1, 1, 1], borderStyle: 'solid' })));
        expect(namesOf(withBorder)).toEqual(['--color-border']);
    });
    it('does not call a grey an accent', () => {
        const result = extractTokens(tree(el('a', { color: 'rgb(20, 20, 20)' }), el('b', { color: 'rgb(20, 20, 20)' }), el('c', { backgroundColor: 'rgb(128, 128, 128)' }), el('d', { backgroundColor: 'rgb(128, 128, 128)' })));
        expect(namesOf(result)).not.toContain('--color-accent');
    });
    it('numbers what is left rather than dropping it', () => {
        const result = extractTokens(tree(el('a', { backgroundColor: 'rgb(1, 1, 1)' }), el('b', { backgroundColor: 'rgb(1, 1, 1)' }), el('c', { backgroundColor: 'rgb(2, 2, 2)' }), el('d', { backgroundColor: 'rgb(2, 2, 2)' }), el('e', { backgroundColor: 'rgb(3, 3, 3)' }), el('f', { backgroundColor: 'rgb(3, 3, 3)' })));
        expect(result.tokens).toHaveLength(3);
        // One took the role name; the rest are numbered, not lost.
        expect(namesOf(result)).toEqual(['--color-1', '--color-2', '--color-background']);
    });
    it('never gives two tokens the same value', () => {
        const result = extractTokens(tree(el('a', { color: 'rgb(5, 5, 5)', backgroundColor: 'rgb(5, 5, 5)' }), el('b', { color: 'rgb(5, 5, 5)', backgroundColor: 'rgb(5, 5, 5)' })));
        expect(new Set(result.tokens.map((t) => t.value)).size).toBe(result.tokens.length);
    });
});
describe('extractTokens — rewriting', () => {
    it('replaces every use with the token, so changing it changes the design', () => {
        const result = extractTokens(tree(el('a', { color: 'rgb(45, 74, 124)' }), el('b', { color: 'rgb(45, 74, 124)' }), el('c', { color: '#2D4A7C' })));
        const name = result.tokens[0]?.name;
        expect(name).toBeDefined();
        for (const id of ['a', 'b', 'c']) {
            expect(result.elements[id]?.color, `${id} still holds a literal`).toBe(`var(${name})`);
        }
    });
    it('counts uses across spellings of the same colour', () => {
        const result = extractTokens(tree(el('a', { color: 'rgb(255, 255, 255)' }), el('b', { color: '#fff' }), el('c', { color: '#FFFFFF' })));
        expect(result.tokens[0]?.uses).toBe(3);
    });
    it('leaves fields it did not tokenise untouched', () => {
        const result = extractTokens(tree(el('a', { color: 'rgb(7, 7, 7)', borderColor: 'rgb(200, 100, 50)' }), el('b', { color: 'rgb(7, 7, 7)' })));
        expect(result.elements['a']?.borderColor).toBe('rgb(200, 100, 50)');
    });
});
describe('resolveTokenNames', () => {
    const token = (name, value) => ({
        name,
        value,
        uses: 2,
    });
    it('keeps a name the theme does not hold', () => {
        const out = resolveTokenNames([token('--color-text', '#111')], new Map());
        expect(out[0]?.name).toBe('--color-text');
    });
    it('reuses a name the theme holds at the SAME value', () => {
        // Importing one site twice should reference the tokens it made the
        // first time, not grow a second identical palette beside them.
        const out = resolveTokenNames([token('--color-text', '#111')], new Map([['--color-text', '#111']]));
        expect(out[0]?.name).toBe('--color-text');
    });
    it('suffixes a name the theme holds at a different value', () => {
        const out = resolveTokenNames([token('--color-text', '#111')], new Map([['--color-text', '#eee']]));
        expect(out[0]?.name).toBe('--color-text-imported');
    });
    // The bug this function exists for. A single fixed `-imported` is
    // unique against the template's palette and not against itself, so a
    // second site imported into the same project landed on a name that
    // already held the FIRST site's colour — and was then filtered out as
    // "already held" and never written.
    // see docs/notes/import-token-collisions.md
    it('escalates when the suffixed name is also taken by another value', () => {
        const out = resolveTokenNames([token('--color-text', '#111')], new Map([
            ['--color-text', '#eee'],
            ['--color-text-imported', '#9db0cc'],
        ]));
        expect(out[0]?.name).toBe('--color-text-imported-2');
    });
    it('keeps escalating for a third and fourth site', () => {
        const existing = new Map([
            ['--color-text', '#eee'],
            ['--color-text-imported', '#9db0cc'],
            ['--color-text-imported-2', '#13111c'],
        ]);
        expect(resolveTokenNames([token('--color-text', '#abc')], existing)[0]?.name).toBe('--color-text-imported-3');
    });
    it('reuses a suffixed name that already holds this exact value', () => {
        // Re-importing the SAME site a second time must not create
        // `-imported-2` beside an identical `-imported`.
        const out = resolveTokenNames([token('--color-text', '#9db0cc')], new Map([
            ['--color-text', '#eee'],
            ['--color-text-imported', '#9db0cc'],
        ]));
        expect(out[0]?.name).toBe('--color-text-imported');
    });
    it('does not let two tokens in one import land on the same name', () => {
        // Nothing in the theme, but the extraction itself can repeat a name.
        const out = resolveTokenNames([token('--color-1', '#111'), token('--color-1', '#222')], new Map());
        expect(out[0]?.name).toBe('--color-1');
        expect(out[1]?.name).toBe('--color-1-imported');
        expect(new Set(out.map((t) => t.name)).size).toBe(2);
    });
});
