import { describe, it, expect } from 'vitest';
import { displayKeyword, parseDisplayKeyword } from '@lib/displayKeyword';
import { breakpointOverrideLines, generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { DEFAULT_BREAKPOINTS } from '@shared/types';
/**
 * `display` as two fields — how the box lays out its children, and how it
 * sits in its parent. see docs/archive/2026-10-13-checks-cleanup-plan.md
 */
const KEYWORDS = ['block', 'inline', 'inline-block', 'contents', 'list-item', 'flex', 'inline-flex', 'grid', 'inline-grid'];
describe('displayKeyword / parseDisplayKeyword', () => {
    it('maps every keyword the model holds there and back', () => {
        for (const keyword of KEYWORDS) {
            const parsed = parseDisplayKeyword(keyword);
            expect(parsed).not.toBeNull();
            expect(displayKeyword(parsed.display, parsed.displayOuter)).toBe(keyword);
        }
    });
    it('keeps inline-flex and inline-grid as flex and grid containers', () => {
        expect(parseDisplayKeyword('inline-flex')?.display).toBe('flex');
        expect(parseDisplayKeyword('inline-grid')?.display).toBe('grid');
    });
    it('gives flex and grid only the inline outer value', () => {
        expect(displayKeyword('flex', 'contents')).toBe('flex');
        expect(displayKeyword('grid', 'list-item')).toBe('grid');
    });
    it('leaves values the model can’t hold to be kept verbatim', () => {
        for (const keyword of ['flow-root', 'table-row', 'inline-table', 'ruby', '', 'none']) {
            expect(parseDisplayKeyword(keyword)).toBeNull();
        }
    });
});
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
    return { elementCss: out.css, card: parsed.elements['a1b2'] };
};
describe('round trip', () => {
    it('writes each keyword back as it was, as a field rather than raw CSS', () => {
        for (const keyword of KEYWORDS.filter((k) => k !== 'block')) {
            const { elementCss, card } = roundTrip(`.card_a1b2 {\n  display: ${keyword};\n}\n`);
            expect(elementCss).toContain(`display: ${keyword};`);
            expect(card?.customProperties['display']).toBeUndefined();
        }
    });
    it('keeps an inline display last in the rule, where it sat as raw CSS', () => {
        const { elementCss } = roundTrip(`.card_a1b2 {\n  position: relative;\n  display: inline-flex;\n}\n`);
        expect(elementCss).toMatch(/\.card_a1b2 \{[^}]*position: relative;[^}]*display: inline-flex;\n\}/);
    });
    it('keeps a display the model can’t hold verbatim', () => {
        const { elementCss, card } = roundTrip(`.card_a1b2 {\n  display: flow-root;\n}\n`);
        expect(card?.customProperties['display']).toBe('flow-root');
        expect(elementCss).toContain('display: flow-root;');
    });
    it('round-trips a breakpoint that turns an inline element back to block', () => {
        const { elementCss } = roundTrip(`.card_a1b2 {\n  display: inline;\n}\n\n@media (max-width: 768px) {\n  .card_a1b2 {\n    display: block;\n  }\n}\n`);
        expect(elementCss).toMatch(/@media \(max-width: 768px\) \{\s*\.card_a1b2 \{\s*display: block;/);
    });
});
describe('breakpoint overrides', () => {
    const card = () => {
        const source = page(`.card_a1b2 {\n  display: inline-flex;\n}\n`);
        const parsed = parseCode(source.tsx, source.css);
        const el = parsed.elements['a1b2'];
        if (el === undefined)
            throw new Error('no card');
        return el;
    };
    it('writes Block as block — it used to write display: none and hide the element', () => {
        expect(breakpointOverrideLines({ display: 'none', displayOuter: undefined }, card())).toContain('display: block;');
        expect(breakpointOverrideLines({ display: 'none', displayOuter: undefined }, card())).not.toContain('display: none;');
    });
    it('combines an override of one half with the base’s other half', () => {
        // Base is inline-flex; switching the layout to grid keeps it inline.
        expect(breakpointOverrideLines({ display: 'grid' }, card())).toContain('display: inline-grid;');
        expect(breakpointOverrideLines({ displayOuter: undefined }, card())).toContain('display: flex;');
    });
});
