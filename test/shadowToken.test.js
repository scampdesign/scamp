import { describe, it, expect } from 'vitest';
import { cssToScampProperty } from '@lib/cssPropertyMap';
import { breakpointOverrideLines, generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { lintView } from '@lib/viewLint';
import { DEFAULT_BREAKPOINTS } from '@shared/types';
/**
 * `box-shadow: var(--shadow-card)` — the whole shadow from a theme token.
 * Item 5 of docs/archive/2026-10-13-checks-cleanup-plan.md
 */
const page = (css) => ({
    tsx: [
        "import styles from './p.module.css';",
        'export default function P() {',
        '  return (',
        '    <div data-scamp-id="root" className={styles.root}>',
        '      <div data-scamp-id="a1b2" className={styles.card_a1b2}></div>',
        '    </div>',
        '  );',
        '}',
    ].join('\n'),
    css: `.root {\n  width: 100%;\n}\n\n${css}`,
});
const roundTrip = (css) => {
    const source = page(css);
    const parsed = parseCode(source.tsx, source.css, { breakpoints: DEFAULT_BREAKPOINTS });
    const out = generateCode({ elements: parsed.elements, rootId: parsed.rootId, pageName: 'P', breakpoints: DEFAULT_BREAKPOINTS });
    return { out: out.css, card: parsed.elements['a1b2'] };
};
describe('parsing box-shadow', () => {
    it('reads a whole-value token as the token, clearing any layers', () => {
        expect(cssToScampProperty['box-shadow']?.('var(--shadow-card)')).toEqual({ boxShadowToken: 'var(--shadow-card)', boxShadows: [] });
    });
    it('reads layers as layers, clearing any token', () => {
        const out = cssToScampProperty['box-shadow']?.('0px 4px 8px 0px rgba(0, 0, 0, 0.15)');
        expect(out?.boxShadows).toHaveLength(1);
        expect(Object.keys(out ?? {})).toContain('boxShadowToken');
        expect(out?.boxShadowToken).toBeUndefined();
    });
});
describe('round trip', () => {
    it('keeps the token, typed, last in the rule where it sat as raw CSS', () => {
        const { out, card } = roundTrip('.card_a1b2 {\n  width: 200px;\n  box-shadow: var(--shadow-card);\n}\n');
        expect(card?.boxShadowToken).toBe('var(--shadow-card)');
        expect(card?.customProperties['box-shadow']).toBeUndefined();
        expect(out).toMatch(/\.card_a1b2 \{[^}]*box-shadow: var\(--shadow-card\);\n\}/);
    });
    it('comments the token out with the rest of the shadow group when it’s hidden', () => {
        const source = page('.card_a1b2 {\n  box-shadow: var(--shadow-card);\n}\n');
        const parsed = parseCode(source.tsx, source.css);
        const card = parsed.elements['a1b2'];
        if (card === undefined)
            throw new Error('no card');
        const out = generateCode({
            elements: { ...parsed.elements, a1b2: { ...card, toggledOffGroups: ['shadow'] } },
            rootId: parsed.rootId,
            pageName: 'P',
        }).css;
        expect(out).toContain('/* shadow off */');
        expect(out).not.toMatch(/^\s*box-shadow: var\(--shadow-card\);/m);
    });
    it('round-trips a token at a breakpoint over a layered base', () => {
        const { out } = roundTrip('.card_a1b2 {\n  box-shadow: 0px 4px 8px 0px rgba(0, 0, 0, 0.15);\n}\n\n@media (max-width: 768px) {\n  .card_a1b2 {\n    box-shadow: var(--shadow-sm);\n  }\n}\n');
        expect(out).toMatch(/@media \(max-width: 768px\) \{\s*\.card_a1b2 \{\s*box-shadow: var\(--shadow-sm\);/);
    });
});
describe('overrides', () => {
    const card = () => {
        const source = page('.card_a1b2 {\n  box-shadow: var(--shadow-card);\n}\n');
        const el = parseCode(source.tsx, source.css).elements['a1b2'];
        if (el === undefined)
            throw new Error('no card');
        return el;
    };
    it('writes a token override, and layers over a token base', () => {
        expect(breakpointOverrideLines({ boxShadowToken: 'var(--shadow-sm)', boxShadows: [] }, card())).toContain('box-shadow: var(--shadow-sm);');
        const layered = breakpointOverrideLines({ boxShadows: [{ offsetX: 0, offsetY: 1, blur: 2, spread: 0, color: 'red', inset: false }], boxShadowToken: undefined }, card());
        expect(layered.join('\n')).toMatch(/box-shadow: 0px 1px 2px red;/);
    });
});
describe('checks', () => {
    it('no longer a note, but an undeclared shadow token is still a problem', () => {
        const source = page('.card_a1b2 {\n  box-shadow: var(--shadow-ghost);\n}\n');
        const parsed = parseCode(source.tsx, source.css);
        const found = lintView({ elements: parsed.elements, rootId: parsed.rootId, themeTokens: ['--shadow-card'] });
        expect(found.map((f) => `${f.severity}:${f.kind}`)).toEqual(['problem:undeclared-token']);
        expect(lintView({ elements: parsed.elements, rootId: parsed.rootId, themeTokens: ['--shadow-ghost'] })).toEqual([]);
    });
});
