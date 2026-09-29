import { describe, it, expect } from 'vitest';
import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { fontsNeededBy, googleFontsUrlFor, needsResolving, primaryFamily, resolveFonts, } from '@lib/importFonts';
/**
 * Working out which typefaces an import needs, and where each comes
 * from. The failure that matters is a silent one: a page whose type
 * falls back to Helvetica looks nothing like the page it copied, and
 * nothing in the file says why.
 * see docs/plans/website-import-plan.md
 */
const el = (id, fontFamily) => ({
    ...DEFAULT_RECT_STYLES,
    id,
    type: 'text',
    parentId: ROOT_ELEMENT_ID,
    childIds: [],
    x: 0,
    y: 0,
    widthMode: 'auto',
    heightMode: 'auto',
    customProperties: {},
    inlineFragments: [],
    ...(fontFamily === undefined ? {} : { fontFamily }),
});
const tree = (...els) => Object.fromEntries(els.map((e) => [e.id, e]));
describe('primaryFamily', () => {
    it('takes the head of the stack, which is the only part that is a decision', () => {
        expect(primaryFamily('Fraunces, Georgia, serif')).toBe('Fraunces');
    });
    it('unquotes a multi-word family', () => {
        expect(primaryFamily('"Inter Tight", sans-serif')).toBe('Inter Tight');
        expect(primaryFamily("'Playfair Display', serif")).toBe('Playfair Display');
    });
    it('skips a metric-matched fallback, which is never installable', () => {
        // Next.js and friends emit these next to the real family.
        expect(primaryFamily('Fraunces, "Fraunces Fallback", Georgia, serif')).toBe('Fraunces');
        expect(primaryFamily('"Inter Fallback", Inter, sans-serif')).toBe('Inter');
    });
    it('returns null for a stack that only asks for a generic', () => {
        for (const stack of ['sans-serif', 'serif', 'system-ui, sans-serif', 'monospace']) {
            expect(primaryFamily(stack)).toBeNull();
        }
    });
    it('returns null for an empty or meaningless stack', () => {
        for (const stack of ['', '   ', ',', 'inherit']) {
            expect(primaryFamily(stack)).toBeNull();
        }
    });
});
describe('needsResolving', () => {
    it.each(['Fraunces', 'Inter Tight', 'Playfair Display'])('says %j is a real typeface', (f) => {
        expect(needsResolving(f)).toBe(true);
    });
    it.each([
        'sans-serif',
        'system-ui',
        '-apple-system',
        'Segoe UI',
        'Helvetica',
        'Arial',
        'Georgia',
        'Courier New',
    ])('says %j is something the OS already answers', (f) => {
        // Telling someone to install Arial would be absurd, and asking
        // Google for it wastes a request.
        expect(needsResolving(f)).toBe(false);
    });
});
describe('fontsNeededBy', () => {
    it('counts each family by how many elements want it', () => {
        const needs = fontsNeededBy(tree(el('a', 'Fraunces, serif'), el('b', 'Fraunces, serif'), el('c', 'Inter, sans-serif')));
        expect(needs).toEqual([
            { family: 'Fraunces', uses: 2 },
            { family: 'Inter', uses: 1 },
        ]);
    });
    it('counts one family however it is spelled in the stack', () => {
        const needs = fontsNeededBy(tree(el('a', 'Inter, sans-serif'), el('b', '"Inter", Helvetica, sans-serif')));
        expect(needs).toEqual([{ family: 'Inter', uses: 2 }]);
    });
    it('ignores elements with no family, and families that are already tokens', () => {
        const needs = fontsNeededBy(tree(el('a'), el('b', 'var(--font-display)')));
        expect(needs).toEqual([]);
    });
    it('orders by use, since the headline face is rarely the commonest', () => {
        const needs = fontsNeededBy(tree(el('a', 'Rare, serif'), el('b', 'Common, serif'), el('c', 'Common, serif')));
        expect(needs[0]?.family).toBe('Common');
    });
});
describe('resolveFonts', () => {
    const needs = [
        { family: 'Fraunces', uses: 4 },
        { family: 'Inter', uses: 9 },
        { family: 'Proprietary Sans', uses: 2 },
    ];
    it('leaves an installed family alone', () => {
        const out = resolveFonts(needs, ['Inter'], {});
        expect(out.find((f) => f.family === 'Inter')?.status).toBe('system');
    });
    it('matches what is installed without caring about case', () => {
        // Local Font Access says `Inter Tight`; CSS may say `inter tight`.
        const out = resolveFonts([{ family: 'inter tight', uses: 1 }], ['Inter Tight'], {});
        expect(out[0]?.status).toBe('system');
    });
    it('embeds a family Google serves', () => {
        const out = resolveFonts(needs, [], { Fraunces: 'https://fonts.googleapis.com/css2?family=Fraunces' });
        const fraunces = out.find((f) => f.family === 'Fraunces');
        expect(fraunces?.status).toBe('google');
        expect(fraunces && 'url' in fraunces && fraunces.url).toContain('Fraunces');
    });
    it('prefers what is installed over embedding it again', () => {
        const out = resolveFonts(needs, ['Fraunces'], { Fraunces: 'https://x' });
        expect(out.find((f) => f.family === 'Fraunces')?.status).toBe('system');
    });
    it('reports a family that is neither, so the user can install it', () => {
        const out = resolveFonts(needs, [], {});
        expect(out.find((f) => f.family === 'Proprietary Sans')?.status).toBe('missing');
    });
    it('never asks about a family the OS already answers', () => {
        const out = resolveFonts([{ family: 'Arial', uses: 12 }], [], {});
        expect(out).toEqual([]);
    });
});
describe('googleFontsUrlFor', () => {
    it('asks for one stylesheet covering every family', () => {
        // css2 takes repeated `family=`, so the project gains one @import
        // rather than one per face.
        const url = googleFontsUrlFor(['Fraunces', 'Inter Tight']);
        expect(url).toContain('family=Fraunces');
        expect(url).toContain('family=Inter+Tight');
        expect(url?.startsWith('https://fonts.googleapis.com/css2?')).toBe(true);
    });
    it('asks for a weight range, so a bold heading is not flattened', () => {
        expect(googleFontsUrlFor(['Inter'])).toContain('wght@300;400;500;600;700;800');
    });
    it('sets display=swap, so text is readable while the face loads', () => {
        expect(googleFontsUrlFor(['Inter'])).toContain('display=swap');
    });
    it('returns null when there is nothing to ask for', () => {
        expect(googleFontsUrlFor([])).toBeNull();
        expect(googleFontsUrlFor(['  '])).toBeNull();
    });
    // Google INSTANCES the font to the axes you name, so asking for `wght`
    // alone returns a file with every other axis frozen at its default.
    // Fraunces defaults to opsz 14, and a 60px headline set in 14px-optical
    // glyphs is ~7% wider — which wrapped a line that fits on the real site
    // and pushed every section below it down the page.
    // see docs/notes/import-variable-fonts.md
    const FRAUNCES = [
        { tag: 'SOFT', min: 0, max: 100 },
        { tag: 'WONK', min: 0, max: 1 },
        { tag: 'opsz', min: 9, max: 144 },
        { tag: 'wght', min: 100, max: 900 },
    ];
    it('asks for every axis across its full range when the axes are known', () => {
        const url = googleFontsUrlFor(['Fraunces'], { Fraunces: FRAUNCES });
        expect(url).toContain('family=Fraunces:opsz,wght,SOFT,WONK@9..144,100..900,0..100,0..1');
    });
    it('orders registered axes before custom ones, which css2 requires', () => {
        // Any other order is a 400 from Google, and a 400 is no font at all.
        const url = googleFontsUrlFor(['Fraunces'], { Fraunces: FRAUNCES });
        const spec = url?.match(/family=Fraunces:([^@]+)@/)?.[1];
        expect(spec).toBe('opsz,wght,SOFT,WONK');
    });
    it('falls back to the weight list for a family whose axes are unknown', () => {
        // A family Google has no metadata for still has to get a URL.
        const url = googleFontsUrlFor(['Fraunces', 'Inter'], { Fraunces: FRAUNCES });
        expect(url).toContain('family=Fraunces:opsz,wght,SOFT,WONK@');
        expect(url).toContain('family=Inter:wght@300;400;500;600;700;800');
    });
    it('asks for the full weight range when weight is the only axis', () => {
        // Better than the enumerated list: it keeps the variable font whole
        // rather than pinning it to six instances.
        const url = googleFontsUrlFor(['Inter'], {
            Inter: [{ tag: 'wght', min: 100, max: 900 }],
        });
        expect(url).toContain('family=Inter:wght@100..900');
    });
});
