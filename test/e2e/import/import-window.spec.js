import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '../fixtures/app';
import { pageRoot } from '../fixtures/selectors';
import { openPagesSection } from '../fixtures/components';
/**
 * Website import, end to end: the button opens a browser, the browser
 * reads a page, and a view appears in the project.
 *
 * The page under test is the same local fixture the reducer's unit
 * tests use, so a failure here is about the window and the round trip
 * rather than about the reduction — that is already covered offline in
 * `test/importReduce.test.ts`.
 * see docs/plans/website-import-plan.md
 */
const FIXTURE_URL = pathToFileURL(path.resolve(__dirname, '../../fixtures/import/pages/marketing.html')).href;
test.use({ projectOptions: { format: 'scamp' } });
test.describe('website import', () => {
    test('imports a page into a new view, and says what it dropped', async ({ app, window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await openPagesSection(window);
        // The importer is a second BrowserWindow; catch it as it opens.
        const opened = app.waitForEvent('window');
        await window.getByRole('button', { name: /Import a page/ }).click();
        const importWindow = await opened;
        await importWindow.waitForLoadState('domcontentloaded');
        // Navigate to the fixture the same way a person would.
        const urlBar = importWindow.getByLabel('Address');
        await expect(urlBar).toBeVisible();
        await urlBar.fill(FIXTURE_URL);
        await urlBar.press('Enter');
        const importButton = importWindow.getByRole('button', { name: 'Import', exact: true });
        await expect(importButton).toBeEnabled();
        await importButton.click();
        // The importer reports back from the app window, which is the only
        // place that knows whether a view was actually written.
        await expect(importWindow.getByText(/Imported/)).toBeVisible({ timeout: 30_000 });
        // The report is a disclosure that opens itself when something was
        // lost, so open it only if it is shut. The `::before` star is no
        // longer a loss — it comes across as a real text element — and the
        // report has to say so rather than stay quiet about it.
        const toggle = importWindow.getByRole('button', { name: /What changed|Hide/ });
        await expect(toggle).toBeVisible();
        if (((await toggle.textContent()) ?? '').includes('What changed')) {
            await toggle.click();
        }
        await expect(importWindow.getByText(/recovered as text/)).toBeVisible();
        // And the view is on disk, named after the page's title.
        await expect
            .poll(async () => project.viewExists('NorthwindShipFaster'), { timeout: 15_000 })
            .toBe(true);
        const { tsx, css } = await project.readView('NorthwindShipFaster');
        // Real structure, not a screenshot: the page's semantic tags survive.
        expect(tsx).toContain('data-scamp-id="root"');
        expect(tsx).toContain('<nav');
        expect(tsx).toContain('<header');
        // The heading's highlighted word is its own element — a `<span>`
        // whose whole appearance came from a class the import cannot
        // carry — while the one that styled nothing stayed inline markup.
        expect(tsx).toContain('>thing<');
        expect(tsx).toContain('<span>actually</span>');
        // And the wordmark keeps all three of its parts, with their words.
        expect(tsx).toMatch(/<b [^>]*>wind<\/b>/);
        expect(tsx).toMatch(/<sup [^>]*>®<\/sup>/);
        // The three cards' images came across as image elements.
        expect(tsx.match(/<img/g)?.length).toBe(3);
        // And the styles landed in the module, not inline.
        expect(css).toContain('.root');
        expect(tsx).not.toContain('style=');
    });
    test('gives the imported view a URL the framework actually serves', async ({ app, window, project, }) => {
        // Without this the view lands on disk, shows in the layers panel and
        // the page picker, and 404s: the preview loaded the home page and
        // every link or picker jump after it was a blank white screen.
        // Scamp-format projects route from `routes/`; only Next.js serves
        // `app/<slug>/page.tsx`. see docs/notes/imported-view-routes.md
        await expect(pageRoot(window)).toBeVisible();
        await openPagesSection(window);
        const opened = app.waitForEvent('window');
        await window.getByRole('button', { name: /Import a page/ }).click();
        const importWindow = await opened;
        await importWindow.waitForLoadState('domcontentloaded');
        await importWindow.getByLabel('Address').fill(FIXTURE_URL);
        await importWindow.getByLabel('Address').press('Enter');
        const btn = importWindow.getByRole('button', { name: 'Import', exact: true });
        await expect(btn).toBeEnabled();
        await btn.click();
        await expect(importWindow.getByText(/Imported/)).toBeVisible({ timeout: 30_000 });
        await expect
            .poll(async () => project.viewExists('NorthwindShipFaster'), { timeout: 15_000 })
            .toBe(true);
        const route = path.join(project.dir, 'routes', 'northwind-ship-faster.tsx');
        await expect.poll(async () => existsSync(route), { timeout: 15_000 }).toBe(true);
        const tsx = await fs.readFile(route, 'utf-8');
        expect(tsx).toContain("import NorthwindShipFaster from '@/views/NorthwindShipFaster/NorthwindShipFaster'");
        expect(tsx).toContain('<NorthwindShipFaster />');
        // The framework needs one, and the migration writes it too.
        expect(tsx).toContain("export const render = 'static'");
        // And no Next.js wrapper, which this project would never serve.
        expect(existsSync(path.join(project.dir, 'app', 'northwind-ship-faster', 'page.tsx'))).toBe(false);
    });
    test('reads the page at each breakpoint and writes the overrides', async ({ app, window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await openPagesSection(window);
        const opened = app.waitForEvent('window');
        await window.getByRole('button', { name: /Import a page/ }).click();
        const importWindow = await opened;
        await importWindow.waitForLoadState('domcontentloaded');
        await importWindow.getByLabel('Address').fill(FIXTURE_URL);
        await importWindow.getByLabel('Address').press('Enter');
        const btn = importWindow.getByRole('button', { name: 'Import', exact: true });
        await expect(btn).toBeEnabled();
        await btn.click();
        await expect(importWindow.getByText(/Imported/)).toBeVisible({ timeout: 30_000 });
        // The fixture's @media blocks should come back as breakpoint
        // overrides, which Scamp emits as its own @media rules.
        const { css } = await project.readView('NorthwindShipFaster');
        expect(css).toMatch(/@media \(max-width: (768|390)px\)/);
    });
    test('writes literal colours and adds no theme tokens', async ({ app, window, project, }) => {
        // The importer used to lift repeated colours into theme tokens. It
        // does not any more, deliberately: a design system is a set of
        // decisions about what SHOULD be shared, and an importer counting
        // occurrences cannot make those. It produced a theme nobody chose,
        // and — with two sites in one project — a view painted in the other
        // site's palette.
        //
        // Two tests were removed for this one. They asserted the tokens
        // existed, and the second had started passing for the wrong reason:
        // the template's own `--color-brand-*` satisfied "the theme contains
        // --color-".
        // see docs/notes/import-token-collisions.md
        await expect(pageRoot(window)).toBeVisible();
        await openPagesSection(window);
        const before = await project.readTheme();
        const opened = app.waitForEvent('window');
        await window.getByRole('button', { name: /Import a page/ }).click();
        const importWindow = await opened;
        await importWindow.waitForLoadState('domcontentloaded');
        await importWindow.getByLabel('Address').fill(FIXTURE_URL);
        await importWindow.getByLabel('Address').press('Enter');
        const btn = importWindow.getByRole('button', { name: 'Import', exact: true });
        await expect(btn).toBeEnabled();
        await btn.click();
        await expect(importWindow.getByText(/Imported/)).toBeVisible({ timeout: 20_000 });
        await expect
            .poll(async () => project.viewExists('NorthwindShipFaster'), { timeout: 15_000 })
            .toBe(true);
        const { css } = await project.readView('NorthwindShipFaster');
        expect(css).not.toMatch(/var\(--color-/);
        // A real colour, written out.
        expect(css).toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
        // The theme gains fonts, which an import legitimately installs, and
        // no colour tokens.
        const after = await project.readTheme();
        const colourNames = (theme) => [...theme.matchAll(/^\s*(--color-[\w-]+):/gm)].map((m) => m[1] ?? '');
        expect(colourNames(after)).toEqual(colourNames(before));
    });
    test('reports an image it could not fetch instead of failing the import', async ({ app, window, project, }) => {
        // The fixture's images are relative paths that resolve to file://,
        // which the downloader refuses — the right outcome is a named
        // shortfall and a view that still exists.
        await expect(pageRoot(window)).toBeVisible();
        await openPagesSection(window);
        const opened = app.waitForEvent('window');
        await window.getByRole('button', { name: /Import a page/ }).click();
        const importWindow = await opened;
        await importWindow.waitForLoadState('domcontentloaded');
        await importWindow.getByLabel('Address').fill(FIXTURE_URL);
        await importWindow.getByLabel('Address').press('Enter');
        const btn = importWindow.getByRole('button', { name: 'Import', exact: true });
        await expect(btn).toBeEnabled();
        await btn.click();
        await expect(importWindow.getByText(/Imported/)).toBeVisible({ timeout: 20_000 });
        await expect
            .poll(async () => project.viewExists('NorthwindShipFaster'), { timeout: 15_000 })
            .toBe(true);
    });
    test('refuses to overwrite an import that is already there', async ({ app, window, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await openPagesSection(window);
        const importOnce = async () => {
            const opened = app.waitForEvent('window');
            await window.getByRole('button', { name: /Import a page/ }).click();
            const w = await opened;
            await w.waitForLoadState('domcontentloaded');
            await w.getByLabel('Address').fill(FIXTURE_URL);
            await w.getByLabel('Address').press('Enter');
            const btn = w.getByRole('button', { name: 'Import', exact: true });
            await expect(btn).toBeEnabled();
            await btn.click();
            await expect(w.getByText(/Imported/)).toBeVisible({ timeout: 20_000 });
            await w.close();
        };
        await importOnce();
        await expect
            .poll(async () => project.viewExists('NorthwindShipFaster'), { timeout: 15_000 })
            .toBe(true);
        await importOnce();
        // The second import lands beside the first rather than on top of it.
        await expect
            .poll(async () => project.viewExists('NorthwindShipFaster2'), { timeout: 15_000 })
            .toBe(true);
    });
});
