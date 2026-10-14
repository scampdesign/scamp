import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { componentPathsFor, createComponent, deleteComponent, readComponent, wrapperPagePathsFor, } from '../../src/main/ipc/componentOps';
import { readProjectComponentsAndViews, readProjectNextjs, } from '../../src/main/ipc/projectScaffold';
import { parseViewWrapper } from '../../src/shared/templates';
/**
 * Views on disk: `views/<Name>/`, the wrapper page that previews one
 * through Next, and the scan that lists views beside components while
 * never listing a wrapper as a page. Real files in a temp dir.
 * see docs/archive/2026-09-16-framework-phase-1-plan.md, step 2
 */
describe('view operations', () => {
    let dir;
    const writeHomePage = async () => {
        await fs.mkdir(path.join(dir, 'app'), { recursive: true });
        await fs.writeFile(path.join(dir, 'app', 'page.tsx'), `import styles from './page.module.css';\n\nexport default function Home() {\n  return (\n    <div data-scamp-id="root" className={styles.root}></div>\n  );\n}\n`);
        await fs.writeFile(path.join(dir, 'app', 'page.module.css'), '.root {\n}\n');
    };
    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-views-'));
        await writeHomePage();
    });
    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });
    it('creates a view under views/ with the wrapper page at its slug', async () => {
        const created = await createComponent({ projectPath: dir, componentName: 'HeroCard', kind: 'view', wrapperSlug: 'hero-card' }, 'nextjs');
        expect(created.kind).toBe('view');
        expect(created.tsxPath).toBe(componentPathsFor(dir, 'HeroCard', 'view').tsxPath);
        expect(created.tsxContent).toContain('export const _scamp');
        const wrapper = await fs.readFile(wrapperPagePathsFor(dir, 'hero-card').tsxPath, 'utf-8');
        expect(parseViewWrapper(wrapper)).toBe('HeroCard');
    });
    it('lists the view beside components and never lists its wrapper as a page', async () => {
        await createComponent({ projectPath: dir, componentName: 'Card', kind: 'component' }, 'nextjs');
        await createComponent({ projectPath: dir, componentName: 'Lobby', kind: 'view', wrapperSlug: 'lobby' }, 'nextjs');
        const all = await readProjectComponentsAndViews(dir);
        expect(all.map((c) => [c.name, c.kind])).toEqual([
            ['Card', 'component'],
            ['Lobby', 'view'],
        ]);
        const pages = await readProjectNextjs(dir);
        expect(pages.map((p) => p.name)).toEqual(['home']);
    });
    it('keeps a stray CSS module beside a wrapper from turning it into a page', async () => {
        await createComponent({ projectPath: dir, componentName: 'Lobby', kind: 'view', wrapperSlug: 'lobby' }, 'nextjs');
        await fs.writeFile(path.join(dir, 'app', 'lobby', 'page.module.css'), '.root {\n}\n');
        const pages = await readProjectNextjs(dir);
        expect(pages.map((p) => p.name)).toEqual(['home']);
    });
    it('leaves an existing page alone unless replacePage is set', async () => {
        await fs.mkdir(path.join(dir, 'app', 'about'));
        const original = `import styles from './page.module.css';\n\nexport default function About() {\n  return (\n    <div data-scamp-id="root" className={styles.root}></div>\n  );\n}\n`;
        await fs.writeFile(path.join(dir, 'app', 'about', 'page.tsx'), original);
        await fs.writeFile(path.join(dir, 'app', 'about', 'page.module.css'), '.root {\n}\n');
        await createComponent({ projectPath: dir, componentName: 'About', kind: 'view', wrapperSlug: 'about' }, 'nextjs');
        expect(await fs.readFile(path.join(dir, 'app', 'about', 'page.tsx'), 'utf-8')).toBe(original);
        expect((await readProjectNextjs(dir)).map((p) => p.name)).toEqual(['home', 'about']);
    });
    it('replaces a page with the wrapper and removes its CSS module when converting', async () => {
        await fs.mkdir(path.join(dir, 'app', 'about'));
        await fs.writeFile(path.join(dir, 'app', 'about', 'page.tsx'), 'export default function About() { return null; }\n');
        await fs.writeFile(path.join(dir, 'app', 'about', 'page.module.css'), '.root {\n}\n');
        await createComponent({
            projectPath: dir,
            componentName: 'About',
            kind: 'view',
            wrapperSlug: 'about',
            replacePage: true,
            tsxContent: 'view tsx',
            cssContent: 'view css',
        }, 'nextjs');
        expect(parseViewWrapper(await fs.readFile(path.join(dir, 'app', 'about', 'page.tsx'), 'utf-8'))).toBe('About');
        await expect(fs.access(path.join(dir, 'app', 'about', 'page.module.css'))).rejects.toThrow();
        expect((await readProjectNextjs(dir)).map((p) => p.name)).toEqual(['home']);
        const view = await readComponent({ projectPath: dir, componentName: 'About', kind: 'view' }, 'nextjs');
        expect(view?.tsxContent).toBe('view tsx');
    });
    it('converting the home page writes the wrapper at app/page.tsx', async () => {
        await createComponent({ projectPath: dir, componentName: 'Home', kind: 'view', wrapperSlug: 'home', replacePage: true }, 'nextjs');
        expect(parseViewWrapper(await fs.readFile(path.join(dir, 'app', 'page.tsx'), 'utf-8'))).toBe('Home');
        expect(await readProjectNextjs(dir)).toEqual([]);
    });
    it('deleting a view removes its folder and its wrapper page, but never the root page', async () => {
        await createComponent({ projectPath: dir, componentName: 'Lobby', kind: 'view', wrapperSlug: 'lobby' }, 'nextjs');
        await deleteComponent({ projectPath: dir, componentName: 'Lobby', kind: 'view' }, 'nextjs');
        await expect(fs.access(path.join(dir, 'views', 'Lobby'))).rejects.toThrow();
        await expect(fs.access(path.join(dir, 'app', 'lobby'))).rejects.toThrow();
        await createComponent({ projectPath: dir, componentName: 'Home', kind: 'view', wrapperSlug: 'home', replacePage: true }, 'nextjs');
        await deleteComponent({ projectPath: dir, componentName: 'Home', kind: 'view' }, 'nextjs');
        expect(parseViewWrapper(await fs.readFile(path.join(dir, 'app', 'page.tsx'), 'utf-8'))).toBe('Home');
    });
    it('does not delete a real page that happens to sit at the slug', async () => {
        await createComponent({ projectPath: dir, componentName: 'About', kind: 'view' }, 'nextjs');
        await fs.mkdir(path.join(dir, 'app', 'about'));
        await fs.writeFile(path.join(dir, 'app', 'about', 'page.tsx'), 'export default function About() { return null; }\n');
        await deleteComponent({ projectPath: dir, componentName: 'About', kind: 'view' }, 'nextjs');
        await expect(fs.access(path.join(dir, 'app', 'about', 'page.tsx'))).resolves.toBeUndefined();
    });
    it('refuses a view whose name a component already uses, and vice versa', async () => {
        await createComponent({ projectPath: dir, componentName: 'Card' }, 'nextjs');
        await expect(createComponent({ projectPath: dir, componentName: 'Card', kind: 'view' }, 'nextjs')).rejects.toThrow(/share one set of names/);
        await createComponent({ projectPath: dir, componentName: 'Lobby', kind: 'view' }, 'nextjs');
        await expect(createComponent({ projectPath: dir, componentName: 'Lobby' }, 'nextjs')).rejects.toThrow(/share one set of names/);
    });
    it('a view shadowed by a same-named component on disk is skipped by the scan', async () => {
        await createComponent({ projectPath: dir, componentName: 'Card' }, 'nextjs');
        await fs.mkdir(path.join(dir, 'views', 'Card'), { recursive: true });
        await fs.writeFile(path.join(dir, 'views', 'Card', 'Card.tsx'), 'x');
        await fs.writeFile(path.join(dir, 'views', 'Card', 'Card.module.css'), 'y');
        const all = await readProjectComponentsAndViews(dir);
        expect(all.map((c) => [c.name, c.kind])).toEqual([['Card', 'component']]);
    });
});
