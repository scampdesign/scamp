import { promises as fs } from 'fs';
import * as path from 'path';

import { test, expect } from '../fixtures/app';
import { clickContextMenuItem, openPageContextMenu, openPagesSection } from '../fixtures/components';
import { pageRoot, pageSidebarItem } from '../fixtures/selectors';

/**
 * Phase 7's exit: a designer adds a page (a view), clicks Generate route,
 * and the route file appears with a load() that returns the view's
 * sample data; the render control rewrites the export; the preview runs
 * the route. see docs/archive/2026-09-16-framework-phase-7-plan.md
 */

const REPO_MODULES = path.resolve(__dirname, '../../../node_modules');

/** Waiting on the file watcher, which is slower than any in-app action. */
const WATCHER_TIMEOUT = 30_000;

test.describe('routes in a Scamp-framework project', () => {
  test.use({ projectOptions: { format: 'scamp' } });

  test('lists routes, generates one for a view, and sets its render mode', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    const routes = window.getByTestId('routes-section');
    await expect(routes).toBeVisible();
    // Page-level, both of them: with nothing selected the panel shows the
    // view's data beside its routes, and no element-level mode toggle.
    await expect(window.getByTestId('view-data-section')).toBeVisible();
    await expect(window.getByRole('radio', { name: 'Visual' })).toHaveCount(0);
    // The template's index route renders Home.
    await expect(routes.getByTestId('route-index.tsx')).toContainText('/');
    await expect(routes.getByTestId('route-index.tsx').getByRole('button', { name: 'static', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // A new page is a view with no route yet.
    await window.getByRole('button', { name: 'Add page', exact: true }).click();
    await window.keyboard.type('about');
    await window.keyboard.press('Enter');
    // Adding a page writes the route that renders it: a page nothing
    // routes is a page nobody can open.
    await expect(routes.getByTestId('route-about.tsx')).toBeVisible({ timeout: 10_000 });
    await expect(routes.getByTestId('generate-About')).toHaveCount(0);
    const file = path.join(project.dir, 'routes', 'about.tsx');
    const tsx = await fs.readFile(file, 'utf-8');
    expect(tsx).toContain("import About from '@/views/About/About';");
    expect(tsx).toContain("export const render = 'static';");
    expect(tsx).toContain('return <About />;');

    // The render control writes the export and nothing else.
    await routes.getByTestId('route-about.tsx').getByRole('button', { name: 'client', exact: true }).click();
    await expect
      .poll(async () => (await fs.readFile(file, 'utf-8')).includes("export const render = 'client';"), { timeout: 10_000 })
      .toBe(true);
    const after = await fs.readFile(file, 'utf-8');
    expect(after.replace("export const render = 'client';", "export const render = 'static';")).toBe(tsx);
    await expect(routes.getByTestId('route-about.tsx').getByRole('button', { name: 'client', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('renaming a page takes its route with it', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    const routes = window.getByTestId('routes-section');

    await window.getByRole('button', { name: 'Add page', exact: true }).click();
    await window.keyboard.type('about');
    await window.keyboard.press('Enter');
    await expect(routes.getByTestId('route-about.tsx')).toBeVisible({ timeout: 10_000 });

    await openPageContextMenu(window, 'about');
    await clickContextMenuItem(window, 'Rename');
    const input = window.getByPlaceholder('page-name');
    await input.fill('contact');
    await input.press('Enter');

    await expect(routes.getByTestId('route-contact.tsx')).toBeVisible({ timeout: 10_000 });
    const tsx = await fs.readFile(path.join(project.dir, 'routes', 'contact.tsx'), 'utf-8');
    // The route points at the view that exists, not the folder that moved.
    expect(tsx).toContain("import Contact from '@/views/Contact/Contact';");
    expect(tsx).toContain('<Contact />');
    expect(tsx).not.toContain('About');
    await expect(
      fs.access(path.join(project.dir, 'routes', 'about.tsx'))
    ).rejects.toThrow();
  });

  test('a route written from outside shows up, and a view with props gets its samples in load()', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    const routes = window.getByTestId('routes-section');
    await fs.mkdir(path.join(project.dir, 'routes', 'api'), { recursive: true });
    await fs.writeFile(path.join(project.dir, 'routes', 'api', 'ping.ts'), "export const GET = () => new Response('pong');\n", 'utf-8');

    // A view with a text prop, written the way the app writes one.
    const view = path.join(project.dir, 'views', 'Hello');
    await fs.mkdir(view, { recursive: true });
    await fs.writeFile(path.join(view, 'Hello.module.css'), '.root {\n  width: 100%;\n  position: relative;\n}\n\n.title_a1b1 {\n  width: 200px;\n}\n', 'utf-8');
    await fs.writeFile(
      path.join(view, 'Hello.tsx'),
      [
        "import styles from './Hello.module.css';",
        '',
        'type HelloProps = {',
        '  title?: string;',
        '  className?: string;',
        '};',
        '',
        'export default function Hello({ title = "Hi there", className }: HelloProps) {',
        '  return (',
        "    <div data-scamp-id=\"root\" className={`${styles.root} ${className ?? ''}`}>",
        '      <h1 data-scamp-id="title_a1b1" className={styles.title_a1b1}>{title}</h1>',
        '    </div>',
        '  );',
        '}',
        '',
        'export const _scamp = { contract: 2, events: [] } as const;',
        '',
      ].join('\n'),
      'utf-8'
    );
    // The section is about the open page, so Hello's route action shows
    // once Hello is the page on the canvas — not while Home is.
    await expect(routes.getByTestId('generate-Hello')).toHaveCount(0);
    await openPagesSection(window);
    await pageSidebarItem(window, 'hello').click({ timeout: WATCHER_TIMEOUT });
    await expect(routes.getByTestId('generate-Hello')).toBeVisible({ timeout: WATCHER_TIMEOUT });
    await routes.getByTestId('generate-Hello').getByRole('button', { name: 'Generate route' }).click();
    await expect(routes.getByTestId('route-hello.tsx')).toBeVisible({ timeout: 10_000 });
    const tsx = await fs.readFile(path.join(project.dir, 'routes', 'hello.tsx'), 'utf-8');
    expect(tsx).toContain('export async function load(_ctx: LoadContext) {');
    expect(tsx).toContain('    title: "Hi there",');
    expect(tsx).toContain('      title={data.title}');
    // Generated by hand, so it opens read-only in the code panel.
    await expect(window.getByTestId('code-panel-route')).toContainText('routes/hello.tsx');
    // An API route belongs to no page, so it is not in this section.
    await expect(routes.getByTestId('route-api/ping.ts')).toHaveCount(0);
  });

  test('the preview runs a generated route and its request lands in the app log', async ({ window, project, app }) => {
    await expect(pageRoot(window)).toBeVisible();
    // The framework, linked instead of installed.
    await fs.rm(path.join(project.dir, 'node_modules'), { recursive: true, force: true });
    await fs.mkdir(path.join(project.dir, 'node_modules'), { recursive: true });
    for (const name of ['scampjs', 'preact']) {
      await fs.symlink(path.join(REPO_MODULES, name), path.join(project.dir, 'node_modules', name), 'dir');
    }
    const windowsBefore = app.windows().length;
    await window.getByTestId('preview-button').click();
    await expect.poll(() => app.windows().length, { timeout: 15_000 }).toBeGreaterThan(windowsBefore);
    const preview = app.windows().find((w) => w.url().includes('preview'));
    if (preview === undefined) throw new Error('no preview window');
    type Status = { kind: string; port?: number };
    let status: Status = { kind: 'idle' };
    await expect
      .poll(
        async () => {
          status = (await preview.evaluate(
            ({ projectPath }) =>
              (window as unknown as { scampPreview: { getStatus: (p: string) => Promise<Status> } }).scampPreview.getStatus(projectPath),
            { projectPath: project.dir }
          )) as Status;
          return status.kind;
        },
        { timeout: 60_000 }
      )
      .toBe('ready');
    // The Home view has a route, so the preview opened the route itself, not /_views/.
    await expect(preview.getByText(/http:\/\/localhost:\d+\/$/)).toBeVisible({ timeout: 15_000 });
    const res = await fetch(`http://127.0.0.1:${status.port ?? 0}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('data-scamp-id="root"');
    // The dev server's --json request line reached the app log, in the
    // terminal panel's App Log tab.
    await window.keyboard.press('ControlOrMeta+`');
    await window.getByTestId('terminal-panel').getByText('App Log').click();
    await expect(window.getByText(/preview: GET \/ 200 \d+ms/).first()).toBeVisible({ timeout: 15_000 });
  });
});
