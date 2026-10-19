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
    it('Modal hides itself when closed, and is designed open', () => {
        const files = starterFiles('Modal', 'Modal');
        const root = parse(files)[ROOT_ELEMENT_ID];
        expect(root?.variantAxes).toEqual([{ prop: 'state', values: ['open', 'closed'], defaultValue: 'open' }]);
        expect(root?.variantOverrides?.['state=closed']?.visibilityMode).toBe('none');
        expect(parseScampMeta(files.tsx)?.events).toEqual(['onClose']);
    });
    it('Menu hides only its panel when closed', () => {
        const files = starterFiles('Menu', 'Menu');
        const elements = parse(files);
        expect(elements[ROOT_ELEMENT_ID]?.variantOverrides).toBeUndefined();
        const panel = Object.values(elements).find((el) => el.id.endsWith('e51b'));
        expect(panel?.variantOverrides?.['state=closed']?.visibilityMode).toBe('none');
        expect(parseScampMeta(files.tsx)?.events).toEqual(['onToggle']);
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
