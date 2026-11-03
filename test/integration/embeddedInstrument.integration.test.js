import { promises as fs } from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SOURCE_ATTR, WRAPPER_CONFIG, wrapperConfigSource } from '../../src/main/embedded/instrument';
const VIRTUAL = '\0scamp-jsx-dev-runtime';
let project;
const loadWrapper = async () => {
    const file = path.join(project, WRAPPER_CONFIG);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, wrapperConfigSource());
    const mod = (await import(`${pathToFileURL(file).href}?t=${Date.now()}`));
    return mod.default({ command: 'serve', mode: 'development' });
};
/** The virtual runtime with the real one stubbed out, so its `jsxDEV` can be called. */
const runtimeFrom = (code) => {
    const body = code
        .replace(/^import .*$/m, 'const realJsxDEV = (...args) => args; const RealFragment = Symbol("Fragment");')
        .replace(/export const /g, 'const ')
        .replace(/export function /g, 'function ');
    return new Function(`${body}\nreturn jsxDEV;`)();
};
beforeEach(async () => {
    // Inside the repo's node_modules, so the config's `import 'vite'` resolves.
    const cache = path.join(process.cwd(), 'node_modules', '.cache');
    await fs.mkdir(cache, { recursive: true });
    project = await fs.mkdtemp(path.join(cache, 'embedded-instrument-'));
});
afterEach(async () => {
    await fs.rm(project, { recursive: true, force: true });
});
describe('the wrapper config', () => {
    it('loads with no project config, roots at the project, and pre-bundles the dev runtime', async () => {
        const config = await loadWrapper();
        expect(config.root).toBe(project);
        expect(config.optimizeDeps.include).toContain('react/jsx-dev-runtime');
        expect(config.plugins.map((p) => p.name)).toEqual(['scamp-source']);
    });
    it('keeps the project’s own config, adding to it', async () => {
        await fs.writeFile(path.join(project, 'vite.config.mjs'), "export default { define: { __APP__: '\"mine\"' }, plugins: [{ name: 'theirs' }] };\n");
        const config = await loadWrapper();
        expect(config.define).toEqual({ __APP__: '"mine"' });
        // Ours first, so it reads the source before the project's plugins change it.
        expect(config.plugins.map((p) => p.name)).toEqual(['scamp-source', 'theirs']);
    });
});
describe('the scamp-source transform', () => {
    it('tags each intrinsic JSX tag with its line and column in the original source', async () => {
        const plugin = (await loadWrapper()).plugins.find((p) => p.name === 'scamp-source');
        const code = 'import { Card } from "./Card";\n\nexport const A = () => (\n  <section className="x">\n    <Card />\n    <span>hi</span>\n  </section>\n);\n';
        const out = plugin?.transform(code, `${project}/src/A.jsx`)?.code ?? '';
        expect(out).toContain(`<section ${SOURCE_ATTR}="src/A.jsx:4:3" className="x">`);
        expect(out).toContain(`<span ${SOURCE_ATTR}="src/A.jsx:6:5">`);
        expect(out).toContain('<Card />');
        // No lines added: every line keeps its number.
        expect(out.split('\n')).toHaveLength(code.split('\n').length);
    });
    it('reads TypeScript, keeps a tag already there, and skips files that aren’t the project’s', async () => {
        const plugin = (await loadWrapper()).plugins.find((p) => p.name === 'scamp-source');
        const tsx = 'type P = { n: number };\nexport const B = ({ n }: P) => <p>{n as number}</p>;\n';
        expect(plugin?.transform(tsx, `${project}/src/B.tsx`)?.code).toContain(`<p ${SOURCE_ATTR}="src/B.tsx:2:32">`);
        expect(plugin?.transform(`const C = () => <b ${SOURCE_ATTR}="given" />;`, `${project}/src/C.jsx`)).toBeNull();
        expect(plugin?.transform('const D = () => <i />;', `${project}/node_modules/x/D.jsx`)).toBeNull();
        expect(plugin?.transform('const E = () => <i />;', '/elsewhere/E.jsx')).toBeNull();
        expect(plugin?.transform('export const n = 1;', `${project}/src/n.js`)).toBeNull();
    });
});
describe('the scamp-source runtime fallback', () => {
    it('swaps the dev runtime for the project’s own files only', async () => {
        const plugin = (await loadWrapper()).plugins.find((p) => p.name === 'scamp-source');
        expect(plugin?.resolveId('react/jsx-dev-runtime', `${project}/src/App.tsx`)).toBe(VIRTUAL);
        expect(plugin?.resolveId('react/jsx-dev-runtime', VIRTUAL)).toBeNull();
        expect(plugin?.resolveId('react/jsx-dev-runtime', `${project}/node_modules/lib/index.js`)).toBeNull();
        expect(plugin?.resolveId('react', `${project}/src/App.tsx`)).toBeNull();
        // A monorepo's hoisted package, above the project, isn't the project's own.
        expect(plugin?.resolveId('react/jsx-dev-runtime', `${path.dirname(project)}/shared/ui.tsx`)).toBeNull();
        expect(plugin?.resolveId('react/jsx-dev-runtime', undefined)).toBeNull();
    });
    it('tags host elements with their project-relative source, and leaves components alone', async () => {
        const plugin = (await loadWrapper()).plugins.find((p) => p.name === 'scamp-source');
        const code = plugin?.load(VIRTUAL) ?? '';
        expect(plugin?.load('/other/module.js')).toBeNull();
        const jsxDEV = runtimeFrom(code);
        const source = { fileName: `${project}/src/Card.tsx`, lineNumber: 12, columnNumber: 5 };
        const host = jsxDEV('div', { className: 'card' }, undefined, false, source, null);
        expect(host[1]).toEqual({ className: 'card', [SOURCE_ATTR]: 'src/Card.tsx:12:5' });
        const Component = () => null;
        const composite = jsxDEV(Component, { title: 'x' }, undefined, false, source, null);
        expect(composite[1]).toEqual({ title: 'x' });
        // A tag passed down already is kept, and no source means no tag.
        expect(jsxDEV('span', { [SOURCE_ATTR]: 'given' }, undefined, false, source, null)[1]).toEqual({ [SOURCE_ATTR]: 'given' });
        expect(jsxDEV('span', {}, undefined, false, undefined, null)[1]).toEqual({});
    });
    it('keeps an absolute path for a file outside the project, and reads Windows separators', async () => {
        const jsxDEV = runtimeFrom((await loadWrapper()).plugins.find((p) => p.name === 'scamp-source')?.load(VIRTUAL) ?? '');
        expect(jsxDEV('p', {}, undefined, false, { fileName: '/elsewhere/x.tsx', lineNumber: 1, columnNumber: 0 }, null)[1]).toEqual({ [SOURCE_ATTR]: '/elsewhere/x.tsx:1:0' });
        const windows = `${project.split('/').join('\\')}\\src\\A.tsx`;
        expect(jsxDEV('p', {}, undefined, false, { fileName: windows, lineNumber: 2, columnNumber: 3 }, null)[1]).toEqual({ [SOURCE_ATTR]: `${windows.split('\\').join('/')}:2:3`.replace(`${project}/`, '') });
    });
});
