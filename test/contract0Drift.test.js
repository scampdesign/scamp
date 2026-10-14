import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { CONTRACT_VERSION } from 'scampjs';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { DEFAULT_BREAKPOINTS } from '@shared/types';
import { SUPPORTED_CONTRACT, isSupportedContract } from '@shared/projectConfig';
/**
 * The phase-1 north star. `scampjs` publishes a fixture project in the
 * exact shape the app must write (CONTRACT.md, "Fixture index"). Each
 * view and component is parsed and regenerated, and the output must be
 * the original byte for byte. Cases marked `pending` are expected to
 * fail until the step that makes them pass lands; `it.fails` turns red
 * the moment one starts passing, which is the cue to flip it.
 * see docs/archive/2026-09-16-framework-phase-1-plan.md
 */
const FIXTURE_ROOT = resolve(__dirname, '../node_modules/scampjs/fixtures/contract-0');
const CASES = [
    { folder: 'views', name: 'Home', status: 'pass' },
    { folder: 'components', name: 'RoundTag', status: 'pass' },
    { folder: 'views', name: 'Lobby', status: 'pass' },
    { folder: 'components', name: 'LinkCard', status: 'pass' },
];
const readFixture = (c) => {
    const dir = resolve(FIXTURE_ROOT, c.folder, c.name);
    return {
        tsx: readFileSync(resolve(dir, `${c.name}.tsx`), 'utf-8'),
        css: readFileSync(resolve(dir, `${c.name}.module.css`), 'utf-8'),
    };
};
const roundTrip = (c) => {
    const original = readFixture(c);
    const parsed = parseCode(original.tsx, original.css, {
        breakpoints: DEFAULT_BREAKPOINTS,
        isComponent: true,
    });
    return generateCode({
        elements: parsed.elements,
        rootId: parsed.rootId,
        pageName: c.name,
        cssModuleImportName: c.name,
        breakpoints: DEFAULT_BREAKPOINTS,
        customMediaBlocks: parsed.customMediaBlocks,
        pageKeyframesBlocks: parsed.keyframesBlocks,
        isComponent: true,
    });
};
describe('contract 0: the published fixture is present', () => {
    it('ships with the scampjs devDependency', () => {
        expect(existsSync(resolve(FIXTURE_ROOT, 'views/Lobby/Lobby.tsx'))).toBe(true);
    });
    it('is the contract version this app supports', () => {
        expect(isSupportedContract(CONTRACT_VERSION)).toBe(true);
        expect(SUPPORTED_CONTRACT.max).toBe(CONTRACT_VERSION);
    });
});
describe('contract 0: generateCode(parseCode(fixture)) is the fixture, byte for byte', () => {
    for (const c of CASES) {
        const label = `${c.folder}/${c.name}/${c.name}.tsx and .module.css`;
        if (c.status === 'pass') {
            it(label, () => {
                const out = roundTrip(c);
                const original = readFixture(c);
                expect(out.tsx).toBe(original.tsx);
                expect(out.css).toBe(original.css);
            });
        }
        else {
            it.fails(`${label} (pending until ${c.status.pendingUntil})`, () => {
                const out = roundTrip(c);
                const original = readFixture(c);
                expect(out.tsx).toBe(original.tsx);
                expect(out.css).toBe(original.css);
            });
        }
    }
});
