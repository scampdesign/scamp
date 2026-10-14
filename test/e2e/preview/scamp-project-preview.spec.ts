import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

import { test, expect } from '../fixtures/app';
import { pageRoot } from '../fixtures/selectors';

/**
 * A new project on the Scamp framework, the default since phase 5,
 * previews through `scamp dev`. The framework comes from the
 * repo's devDependency, linked into the project instead of installed, so
 * the test needs no network. see docs/archive/2026-09-16-framework-phase-3-plan.md
 */

const REPO_MODULES = path.resolve(__dirname, '../../../node_modules');

type Created = {
  format: string;
  pages: ReadonlyArray<{ name: string }>;
  components: ReadonlyArray<{ name: string; kind?: string }>;
};

type PreviewStatus = { kind: string; port?: number };

/** The preload APIs, reached through the DOM global inside `evaluate`. */
type ScampWindow = Window & {
  scamp: {
    createProject: (args: { parentPath: string; name: string; format?: 'nextjs' | 'scamp' }) => Promise<Created>;
    openPreview: (args: {
      projectPath: string;
      pageName: string;
      pageNames: string[];
      routes?: Record<string, string>;
    }) => Promise<unknown>;
    closePreview: (projectPath: string) => Promise<void>;
  };
};
type PreviewWindow = Window & { scampPreview: { getStatus: (projectPath: string) => Promise<PreviewStatus> } };

test.describe('a new Scamp-framework project', () => {
  let parent: string;
  test.beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-framework-'));
  });
  test.afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  test('scaffolds from scampjs/templates and previews a view at /_views/<Name>', async ({
    window: page,
    app,
  }) => {
    await expect(pageRoot(page)).toBeVisible();

    const created = (await page.evaluate(
      ({ parentPath }) =>
        (window as unknown as ScampWindow).scamp.createProject({ parentPath, name: 'framework-app' }),
      { parentPath: parent }
    )) as Created;
    const dir = path.join(parent, 'framework-app');
    expect(created.format).toBe('scamp');
    expect(created.pages).toEqual([]);
    expect(created.components.map((c) => [c.name, c.kind])).toEqual([['Home', 'view']]);
    for (const file of [
      'views/Home/Home.tsx',
      'views/Home/Home.module.css',
      'routes/index.tsx',
      'design/theme.css',
      'scamp-env.d.ts',
      'tsconfig.json',
      'scamp.config.json',
    ]) {
      await expect(fs.access(path.join(dir, file)), file).resolves.toBeUndefined();
    }
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf-8')) as {
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['dev']).toBe('scamp dev');
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['preact', 'scampjs']);
    // The view is the empty form at the contract this build writes.
    expect(await fs.readFile(path.join(dir, 'views/Home/Home.tsx'), 'utf-8')).toContain(
      'export const _scamp = { contract: 2, events: [] } as const;'
    );

    // Stand in for `npm install`: link the framework and preact the repo
    // already has. The first preview would otherwise install for real.
    await fs.mkdir(path.join(dir, 'node_modules'), { recursive: true });
    for (const name of ['scampjs', 'preact']) {
      await fs.symlink(path.join(REPO_MODULES, name), path.join(dir, 'node_modules', name), 'dir');
    }

    const windowsBefore = app.windows().length;
    await page.evaluate(
      ({ projectPath }) =>
        (window as unknown as ScampWindow).scamp.openPreview({
          projectPath,
          pageName: 'home',
          pageNames: ['home'],
          routes: { home: '/_views/Home' },
        }),
      { projectPath: dir }
    );
    await expect.poll(() => app.windows().length, { timeout: 15_000 }).toBeGreaterThan(windowsBefore);
    const preview = app.windows().find((w) => w.url().includes('preview'));
    if (preview === undefined) throw new Error('no preview window opened');

    let status: PreviewStatus = { kind: 'idle' };
    await expect
      .poll(
        async () => {
          status = (await preview.evaluate(
            ({ projectPath }) => (window as unknown as PreviewWindow).scampPreview.getStatus(projectPath),
            { projectPath: dir }
          )) as PreviewStatus;
          return status.kind;
        },
        { timeout: 60_000, message: 'scamp dev becomes ready' }
      )
      .toBe('ready');
    const port = status.port ?? 0;
    expect(port).toBeGreaterThan(0);

    const res = await fetch(`http://127.0.0.1:${port}/_views/Home`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-scamp-id="root"');
    expect(html).toContain('--color-primary');
    expect(JSON.parse(await (await fetch(`http://127.0.0.1:${port}/_views/`)).text())).toEqual({
      views: ['Home'],
    });

    // The preview window navigated its webview to the view, not to `/`.
    await expect(preview.getByText('/_views/Home')).toBeVisible({ timeout: 15_000 });

    await page.evaluate(({ projectPath }) => (window as unknown as ScampWindow).scamp.closePreview(projectPath), {
      projectPath: dir,
    });
  });

  test('a Next.js project is still available on request, for the frozen path', async ({ window: page }) => {
    await expect(pageRoot(page)).toBeVisible();
    const created = (await page.evaluate(
      ({ parentPath }) =>
        (window as unknown as ScampWindow).scamp.createProject({ parentPath, name: 'next-app', format: 'nextjs' }),
      { parentPath: parent }
    )) as Created;
    expect(created.format).toBe('nextjs');
    expect(created.pages.map((p) => p.name)).toEqual(['home']);
    await expect(fs.access(path.join(parent, 'next-app', 'app', 'page.tsx'))).resolves.toBeUndefined();
  });
});
