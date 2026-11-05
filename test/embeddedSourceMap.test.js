import { describe, expect, it } from 'vitest';
import { SourceMapGenerator } from 'source-map-js';
import { classTokens, decodeMappings, inlineMap, originalPosition, projectPath, refineLine, sourceMappingUrl } from '../src/main/embedded/sourceMap';
const generated = (entries) => {
    const gen = new SourceMapGenerator({ file: 'chunk.js' });
    for (const e of entries)
        gen.addMapping({ generated: { line: e.gen[0], column: e.gen[1] }, original: { line: e.src[0], column: e.src[1] }, source: e.file });
    return JSON.parse(gen.toString());
};
describe('decodeMappings', () => {
    it('decodes segments as absolute, 0-based positions carried across lines', () => {
        expect(decodeMappings('AAAA,EAAE;AACA')).toEqual([
            [[0, 0, 0, 0], [2, 0, 0, 2]],
            [[0, 0, 1, 2]],
        ]);
    });
    it('keeps empty lines and skips one-field segments', () => {
        expect(decodeMappings(';;A,CAAC')).toEqual([[], [], [[1, 0, 0, 1]]]);
    });
    it('returns null for characters outside base64', () => {
        expect(decodeMappings('AA!A')).toBeNull();
    });
});
describe('originalPosition', () => {
    const map = generated([
        { gen: [1, 0], src: [10, 4], file: 'webpack://_N_E/./src/app/page.tsx' },
        { gen: [1, 30], src: [12, 6], file: 'webpack://_N_E/./src/app/page.tsx' },
        { gen: [2, 5], src: [3, 2], file: 'webpack://_N_E/./src/Card.tsx' },
    ]);
    it('finds the segment at or before a 1-based stack column', () => {
        expect(originalPosition(map, 1, 31)).toEqual({ source: 'webpack://_N_E/./src/app/page.tsx', line: 12, column: 6 });
        expect(originalPosition(map, 1, 29)).toEqual({ source: 'webpack://_N_E/./src/app/page.tsx', line: 10, column: 4 });
        expect(originalPosition(map, 2, 9)).toEqual({ source: 'webpack://_N_E/./src/Card.tsx', line: 3, column: 2 });
    });
    it('returns null past the end of the mappings', () => {
        expect(originalPosition(map, 9, 1)).toBeNull();
        expect(originalPosition({ mappings: '' }, 1, 1)).toBeNull();
    });
    it('reads an index map through the section that covers the position', () => {
        const index = {
            version: 3,
            sections: [
                { offset: { line: 0, column: 0 }, map: generated([{ gen: [1, 0], src: [1, 0], file: 'turbopack:///[project]/src/a.tsx' }]) },
                { offset: { line: 40, column: 0 }, map: generated([{ gen: [3, 10], src: [25, 8], file: 'turbopack:///[project]/src/app/page.tsx' }]) },
            ],
        };
        expect(originalPosition(index, 43, 12)).toEqual({ source: 'turbopack:///[project]/src/app/page.tsx', line: 25, column: 8 });
        expect(originalPosition(index, 1, 1)?.source).toBe('turbopack:///[project]/src/a.tsx');
    });
    it('prefixes sourceRoot to relative sources', () => {
        expect(originalPosition({ sources: ['page.tsx'], sourceRoot: 'src/app/', mappings: 'AAAA' }, 1, 1)?.source).toBe('src/app/page.tsx');
    });
});
describe('sourceMappingUrl and inlineMap', () => {
    it('takes the last sourceMappingURL comment', () => {
        expect(sourceMappingUrl('a\n//# sourceMappingURL=old.map\nb\n//# sourceMappingURL=chunk.js.map')).toBe('chunk.js.map');
        expect(sourceMappingUrl('no map here')).toBeNull();
    });
    it('decodes a base64 data URL, and rejects anything else', () => {
        const url = `data:application/json;charset=utf-8;base64,${Buffer.from('{"version":3,"mappings":"AAAA"}').toString('base64')}`;
        expect(inlineMap(url)).toEqual({ version: 3, mappings: 'AAAA' });
        expect(inlineMap('chunk.js.map')).toBeNull();
        expect(inlineMap(`data:application/json;base64,${Buffer.from('{not json').toString('base64')}`)).toBeNull();
    });
});
describe('projectPath', () => {
    const root = '/work/shop';
    it('strips webpack, Turbopack and file URL prefixes', () => {
        expect(projectPath('webpack://_N_E/./src/app/page.tsx', root)).toBe('src/app/page.tsx');
        expect(projectPath('turbopack:///[project]/src/app/page.tsx', root)).toBe('src/app/page.tsx');
        expect(projectPath('[project]/app/layout.tsx', root)).toBe('app/layout.tsx');
        expect(projectPath('file:///work/shop/src/Card.tsx?12', root)).toBe('src/Card.tsx');
        expect(projectPath('/work/shop/src/Card.tsx', root)).toBe('src/Card.tsx');
    });
    it('returns null for files outside the project', () => {
        expect(projectPath('/elsewhere/lib.js', root)).toBeNull();
        expect(projectPath('../outside.tsx', root)).toBeNull();
        expect(projectPath('', root)).toBeNull();
    });
    it('keeps node_modules paths, so the window can say the element is a library’s', () => {
        expect(projectPath('webpack://_N_E/./node_modules/@radix-ui/react-menu/dist/index.mjs', root)).toBe('node_modules/@radix-ui/react-menu/dist/index.mjs');
    });
});
describe('classTokens', () => {
    it('finds the local name in each bundler’s CSS Module class', () => {
        expect(classTokens(['page-module__AbCdEf__hero'])).toEqual(['hero']);
        expect(classTokens(['Card_title__x9Y2z'])).toEqual(['title']);
        expect(classTokens(['_card_1d3wx_1'])).toEqual(['card']);
    });
    it('keeps plain and utility classes as written, once each', () => {
        expect(classTokens(['flex', 'p-4', 'flex'])).toEqual(['flex', 'p-4']);
        expect(classTokens([])).toEqual([]);
    });
});
describe('refineLine', () => {
    const code = [
        'export default function Page() {',
        '  return (',
        '    <main className={styles.page}>',
        '      <section className={styles.hero}>',
        '        <h1>Welcome</h1>',
        '      </section>',
        '      <section className={styles.list}>',
        '        <h1>Products</h1>',
        '      </section>',
        '    </main>',
        '  );',
        '}',
    ].join('\n');
    it('keeps the given line when it opens the tag', () => {
        expect(refineLine(code, 4, { tag: 'section', classes: [], text: '' })).toEqual({ line: 4, column: 6 });
    });
    it('picks the line whose class matches, from a nearby guess', () => {
        expect(refineLine(code, 2, { tag: 'section', classes: ['page-module__x1__list'], text: '' })).toEqual({ line: 7, column: 6 });
    });
    it('uses the text to tell two of the same tag apart', () => {
        expect(refineLine(code, 1, { tag: 'h1', classes: [], text: 'Products' })).toEqual({ line: 8, column: 8 });
    });
    it('does not match a longer tag name, and returns null with no match', () => {
        expect(refineLine('<header>\n<head>', 1, { tag: 'head', classes: [], text: '' })).toEqual({ line: 2, column: 0 });
        expect(refineLine(code, 4, { tag: 'article', classes: [], text: '' })).toBeNull();
    });
});
