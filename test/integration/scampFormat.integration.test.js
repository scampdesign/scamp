import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detectProjectFormat } from '../../src/main/ipc/projectFormat';
import { readFrameworkInfo, readRequestedFrameworkRange } from '../../src/main/ipc/frameworkVersion';
import { enumerateProjectFiles } from '../../src/main/ipc/snapshotOps';
import { themePathFor } from '../../src/main/ipc/themeOps';
import { designMdPathFor } from '../../src/main/ipc/designMdOps';
import { AGENT_MD_CONTENT, AGENT_MD_CONTENT_SCAMP } from '../../src/shared/templates';
/**
 * The scamp project format: detected from `views/` plus a `scampjs`
 * dependency, read without pages, with its theme and design doc under
 * `design/`, and its installed framework's contract read from
 * node_modules. Real files in a temp dir.
 * see docs/archive/2026-09-16-framework-phase-1-plan.md, step 6
 */
describe('scamp project format', () => {
    let dir;
    const writeJson = async (rel, value) => {
        await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
        await fs.writeFile(path.join(dir, rel), JSON.stringify(value, null, 2));
    };
    const write = async (rel, content) => {
        await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
        await fs.writeFile(path.join(dir, rel), content);
    };
    const scaffoldScamp = async () => {
        await writeJson('package.json', { name: 'p', dependencies: { scampjs: '^0.0.5', preact: '^10' } });
        await write('views/Home/Home.tsx', 'view');
        await write('views/Home/Home.module.css', '.root {\n}\n');
        await write('components/Card/Card.tsx', 'comp');
        await write('components/Card/Card.module.css', '.root {\n}\n');
        await write('design/theme.css', ':root {}\n');
        await write('routes/index.tsx', 'route');
        await write('routes/game/[token]/lobby.tsx', 'route');
    };
    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-format-'));
    });
    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });
    it('detects scamp from views/ plus a scampjs dependency, ahead of a leftover app/', async () => {
        await scaffoldScamp();
        expect(await detectProjectFormat(dir)).toBe('scamp');
        await write('app/page.tsx', 'leftover');
        expect(await detectProjectFormat(dir)).toBe('scamp');
    });
    it('does not call a Next project with a views/ folder scamp without the dependency', async () => {
        await writeJson('package.json', { name: 'p', dependencies: { next: '^15' } });
        await write('views/Home/Home.tsx', 'view');
        await write('app/page.tsx', 'page');
        expect(await detectProjectFormat(dir)).toBe('nextjs');
    });
    it('accepts scampjs as a devDependency', async () => {
        await writeJson('package.json', { name: 'p', devDependencies: { scampjs: '^0.0.5' } });
        await write('views/Home/Home.tsx', 'view');
        expect(await detectProjectFormat(dir)).toBe('scamp');
    });
    it('puts the theme and DESIGN.md under design/', () => {
        expect(themePathFor(dir, 'scamp')).toBe(path.join(dir, 'design', 'theme.css'));
        expect(designMdPathFor(dir, 'scamp')).toBe(path.join(dir, 'design', 'DESIGN.md'));
        expect(themePathFor(dir, 'nextjs')).toBe(path.join(dir, 'app', 'theme.css'));
        expect(designMdPathFor(dir)).toBe(path.join(dir, 'DESIGN.md'));
    });
    it('reads the installed framework version and contract, or nulls when not installed', async () => {
        await scaffoldScamp();
        expect(await readFrameworkInfo(dir)).toEqual({ installedVersion: null, contract: null });
        expect(await readRequestedFrameworkRange(dir)).toBe('^0.0.5');
        await writeJson('node_modules/scampjs/package.json', { name: 'scampjs', version: '0.0.5', scampjs: { contract: 0 } });
        expect(await readFrameworkInfo(dir)).toEqual({ installedVersion: '0.0.5', contract: 0 });
        await writeJson('node_modules/scampjs/package.json', { name: 'scampjs', version: '1.0.0' });
        expect(await readFrameworkInfo(dir)).toEqual({ installedVersion: '1.0.0', contract: null });
    });
    it('snapshots views, components, design/, and every route file', async () => {
        await scaffoldScamp();
        const files = (await enumerateProjectFiles(dir, 'scamp')).map((f) => path.relative(dir, f)).sort();
        expect(files).toEqual([
            'components/Card/Card.module.css',
            'components/Card/Card.tsx',
            'design/theme.css',
            'routes/game/[token]/lobby.tsx',
            'routes/index.tsx',
            'views/Home/Home.module.css',
            'views/Home/Home.tsx',
        ]);
    });
    it('writes a scamp-flavoured agent.md without the Next.js layout or wrapper pages', () => {
        expect(AGENT_MD_CONTENT_SCAMP).not.toBe(AGENT_MD_CONTENT);
        expect(AGENT_MD_CONTENT_SCAMP).toContain('Scamp framework');
        expect(AGENT_MD_CONTENT_SCAMP).toContain('routes/');
        expect(AGENT_MD_CONTENT_SCAMP).not.toContain('can be opened\ndirectly in a Next.js workspace');
        expect(AGENT_MD_CONTENT_SCAMP).not.toContain('one-line wrapper');
        expect(AGENT_MD_CONTENT_SCAMP).toContain('There are no wrapper pages');
        expect(AGENT_MD_CONTENT_SCAMP).toContain('### Data bindings');
        expect(AGENT_MD_CONTENT).toContain('can be opened\ndirectly in a Next.js workspace');
    });
});
