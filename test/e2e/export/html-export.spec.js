import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test, expect, stubOpenDialog } from '../fixtures/app';
import { drawAndSelectRect } from '../fixtures/panel';
import { pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';
/**
 * Export HTML writes the whole project as a folder of plain HTML + CSS.
 * The folder picker is stubbed, and `shell.openPath` is neutered so the
 * success path doesn't spawn a file manager mid-run.
 *
 * see docs/archive/2026-08-27-html-export-plan.md
 */
/** Stop the export's "reveal the folder" step from opening a real window. */
const stubOpenPath = async (app) => {
    await app.evaluate(({ shell }) => {
        shell.openPath = async () => '';
    });
};
const waitForFile = async (filePath) => {
    await expect
        .poll(async () => {
        try {
            const stat = await fs.stat(filePath);
            return stat.size > 0;
        }
        catch {
            return false;
        }
    }, { timeout: 15_000 })
        .toBe(true);
};
test.describe('export: HTML', () => {
    test('writes a browsable folder of HTML and CSS for the project', async ({ window, app, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        const className = await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 260, y: 200 });
        await waitForSaved(window);
        const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-html-out-'));
        await stubOpenDialog(app, outDir);
        await stubOpenPath(app);
        const exportButton = window.getByTestId('export-html-button');
        await exportButton.click();
        // The button itself has to report the outcome — revealing the folder
        // isn't reliable feedback (shell.openPath can no-op), and a silent
        // success is indistinguishable from a silent failure.
        await expect(exportButton).toHaveAttribute('data-export-status', 'done', {
            timeout: 15_000,
        });
        await expect(exportButton).toContainText(/Exported \d+ file/);
        // Scamp creates its own folder inside the one that was picked.
        const created = (await fs.readdir(outDir)).filter((e) => !e.startsWith('.'));
        expect(created).toHaveLength(1);
        const siteDir = path.join(outDir, created[0] ?? '');
        const indexPath = path.join(siteDir, 'index.html');
        await waitForFile(indexPath);
        const html = await fs.readFile(indexPath, 'utf-8');
        // A real document, not a JSX fragment.
        expect(html.startsWith('<!doctype html>')).toBe(true);
        expect(html).toContain('<body style="margin: 0; min-height: 100vh">');
        // The element drawn above made it through, as plain HTML.
        expect(html).toContain(`class="${className}"`);
        expect(html).not.toContain('className');
        // And its rule is in a stylesheet the page actually links.
        const css = await fs.readFile(path.join(siteDir, 'index.css'), 'utf-8');
        expect(css).toContain(`.${className}`);
        expect(html).toContain('href="index.css"');
        expect(html).toContain('href="theme.css"');
        await expect(fs.access(path.join(siteDir, 'theme.css'))).resolves.toBeUndefined();
        await fs.rm(outDir, { recursive: true, force: true });
        void project;
    });
    test('creates its own folder inside the one you pick, leaving it untouched', async ({ window, app, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await waitForSaved(window);
        // Picking somewhere real — Documents, say — is the normal case, and it
        // already has things in it. The export belongs in a new folder inside,
        // not smeared over what's there.
        const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-html-busy-'));
        const precious = path.join(outDir, 'taxes.pdf');
        await fs.writeFile(precious, 'do not delete');
        await stubOpenDialog(app, outDir);
        await stubOpenPath(app);
        const exportButton = window.getByTestId('export-html-button');
        await exportButton.click();
        await expect(exportButton).toHaveAttribute('data-export-status', 'done', {
            timeout: 15_000,
        });
        // The chosen folder gained exactly one entry, and kept what it had.
        const entries = (await fs.readdir(outDir)).sort();
        expect(entries).toHaveLength(2);
        expect(entries).toContain('taxes.pdf');
        expect(await fs.readFile(precious, 'utf-8')).toBe('do not delete');
        const created = entries.find((e) => e !== 'taxes.pdf') ?? '';
        await waitForFile(path.join(outDir, created, 'index.html'));
        await fs.rm(outDir, { recursive: true, force: true });
    });
    test('exports beside the previous one rather than over an unrelated folder', async ({ window, app, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await waitForSaved(window);
        const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-html-twice-'));
        await stubOpenDialog(app, outDir);
        await stubOpenPath(app);
        const exportButton = window.getByTestId('export-html-button');
        await exportButton.click();
        await expect(exportButton).toHaveAttribute('data-export-status', 'done', {
            timeout: 15_000,
        });
        const first = (await fs.readdir(outDir)).sort();
        expect(first).toHaveLength(1);
        // Something unrelated now squats on the name the export would reuse.
        const taken = path.join(outDir, first[0] ?? '');
        await fs.rm(path.join(taken, '.scamp-export'), { force: true });
        await expect(exportButton).toHaveAttribute('data-export-status', 'idle', {
            timeout: 20_000,
        });
        await exportButton.click();
        await expect(exportButton).toHaveAttribute('data-export-status', 'done', {
            timeout: 15_000,
        });
        // A second folder, rather than the first one overwritten.
        expect((await fs.readdir(outDir)).sort()).toHaveLength(2);
        await fs.rm(outDir, { recursive: true, force: true });
    });
});
