import { describe, it, expect } from 'vitest';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { parseScampMeta } from '@lib/parseCode/tsx';
import { lintView } from '@lib/viewLint';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { STARTERS, freeStarterName, starterFiles } from '@lib/starterComponents';
import { DEFAULT_BREAKPOINTS } from '@shared/types';
import { WRITTEN_CONTRACT } from '@shared/projectConfig';
/** The starter components: canonical, renamable, and clean. see docs/plans/component-variants-plan.md */
const parse = (files) => parseCode(files.tsx, files.css, { breakpoints: DEFAULT_BREAKPOINTS, isComponent: true }).elements;
const regenerate = (files, name) => generateCode({
    elements: parse(files),
    rootId: ROOT_ELEMENT_ID,
    pageName: name,
    cssModuleImportName: name,
    breakpoints: DEFAULT_BREAKPOINTS,
    customMediaBlocks: [],
    pageKeyframesBlocks: [],
    isComponent: true,
});
const NAMES = STARTERS.map((s) => s.name);
describe('starterFiles', () => {
    it.each(NAMES)('%s round-trips byte for byte, so adding it causes no rewrite', (starter) => {
        const files = starterFiles(starter, starter);
        expect(regenerate(files, starter)).toEqual(files);
    });
    it.each(NAMES)('%s renamed still round-trips, under the new name', (starter) => {
        const files = starterFiles(starter, `${starter}2`);
        expect(files.tsx).toContain(`import styles from './${starter}2.module.css';`);
        expect(files.tsx).toContain(`export default function ${starter}2(`);
        expect(files.tsx).toContain(`: ${starter}2Props)`);
        expect(files.tsx).not.toContain(`${starter}Props`);
        expect(files.tsx).not.toContain(`./${starter}.module.css`);
        expect(regenerate(files, `${starter}2`)).toEqual(files);
    });
    it.each(NAMES)('%s has no problems for the checks to report', (starter) => {
        const findings = lintView({ elements: parse(starterFiles(starter, starter)), rootId: ROOT_ELEMENT_ID, themeTokens: [] });
        expect(findings.filter((f) => f.severity === 'problem')).toEqual([]);
    });
    it('writes the current contract', () => {
        for (const starter of NAMES) {
            expect(parseScampMeta(starterFiles(starter, starter).tsx)?.contract).toBe(WRITTEN_CONTRACT);
        }
    });
    it('Button has variant and size axes and an onClick event', () => {
        const files = starterFiles('Button', 'Button');
        expect(parse(files)[ROOT_ELEMENT_ID]?.variantAxes).toEqual([
            { prop: 'variant', values: ['default', 'outline', 'secondary'], defaultValue: 'default' },
            { prop: 'size', values: ['small', 'medium', 'large'], defaultValue: 'medium' },
        ]);
        expect(parseScampMeta(files.tsx)?.events).toEqual(['onClick']);
    });
    it('Modal starts closed, and its own button, Close, backdrop, and Escape open and close it', () => {
        const elements = parse(starterFiles('Modal', 'Modal'));
        const root = elements[ROOT_ELEMENT_ID];
        expect(root?.variantAxes).toEqual([{ prop: 'state', values: ['closed', 'open'], defaultValue: 'closed' }]);
        expect(root?.variantInteractions?.map((i) => [i.trigger, i.from, i.to, i.target ?? 'root'])).toEqual(expect.arrayContaining([
            ['escape', 'open', 'closed', 'root'],
            ['click', 'closed', 'open', 'd41f'],
            ['click', 'open', 'closed', 'd419'],
            ['click', 'open', 'closed', 'd41e'],
        ]));
        expect(parseScampMeta(starterFiles('Modal', 'Modal').tsx)?.events).toEqual(['onClose']);
    });
    it('Menu starts closed, toggles from its trigger, and closes on a click outside or Escape', () => {
        const elements = parse(starterFiles('Menu', 'Menu'));
        expect(elements[ROOT_ELEMENT_ID]?.variantInteractions?.map((i) => [i.trigger, i.from, i.to])).toEqual(expect.arrayContaining([
            ['outside', 'open', 'closed'],
            ['escape', 'open', 'closed'],
            ['click', 'closed', 'open'],
            ['click', 'open', 'closed'],
        ]));
        expect(parseScampMeta(starterFiles('Menu', 'Menu').tsx)?.events).toEqual(['onToggle']);
    });
    it.each(['Modal', 'Menu'])('%s fades: hidden at opacity 0 when closed, with a transition, so it fades out too', (starter) => {
        const { css } = starterFiles(starter, starter);
        expect(css).toContain('visibility: hidden;');
        expect(css).toContain('transition: all 200ms ease;');
        expect(css).toMatch(/\.root\[data-state="open"\] \.[a-z]+_[0-9a-f]{4} \{\n  opacity: 1;\n  visibility: visible;\n\}/);
        expect(css).not.toContain('display: none');
    });
    it.each(['Modal', 'Menu'])('%s leaves the click attributes out of a Next.js project, and still round-trips', (starter) => {
        const files = starterFiles(starter, starter, 'nextjs');
        expect(files.tsx).not.toMatch(/data-scamp-(click|outside|escape)/);
        expect(regenerate(files, starter)).toEqual(files);
    });
});
describe('freeStarterName', () => {
    it('uses the starter’s name when it’s free', () => {
        expect(freeStarterName('Button', ['Card'])).toBe('Button');
    });
    it('counts up past taken names, ignoring case as a macOS disk does', () => {
        expect(freeStarterName('Button', ['Button'])).toBe('Button2');
        expect(freeStarterName('Modal', ['modal', 'MODAL2'])).toBe('Modal3');
    });
});
