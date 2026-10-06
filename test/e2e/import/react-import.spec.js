import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stubOpenDialog, test, expect } from '../fixtures/app';
import { openPagesSection } from '../fixtures/components';
import { pageRoot } from '../fixtures/selectors';
/**
 * React app import, end to end: choose a project folder, let Scamp run
 * its dev server, pick a route from the app's own router, and import it
 * as a view named after the route.
 *
 * The app is `test/fixtures/react-app`, copied to a temp folder with
 * Scamp's own node_modules linked in, so nothing is installed.
 * see docs/plans/react-import-plan.md
 */
test.use({ projectOptions: { format: 'scamp' } });
const REPO = path.resolve(__dirname, '../../..');
const copyFixtureApp = async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-react-app-'));
    await fs.cp(path.join(REPO, 'test/fixtures/react-app'), dir, { recursive: true });
    await fs.symlink(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    return dir;
};
test('runs a React app, lists its routes, and imports one as a view', async ({ app, window, project }) => {
    const appDir = await copyFixtureApp();
    try {
        await expect(pageRoot(window)).toBeVisible();
        await openPagesSection(window);
        await stubOpenDialog(app, appDir);
        await window.getByRole('button', { name: /Import a React app/ }).click();
        const dialog = window.getByTestId('react-import-dialog');
        await dialog.getByRole('button', { name: 'Choose folder…' }).click();
        // Nothing runs until the user has seen the command.
        await expect(dialog).toContainText('fixture-react-app');
        await expect(dialog).toContainText('Vite');
        await expect(dialog.getByText('npm run dev')).toBeVisible();
        const opened = app.waitForEvent('window');
        await dialog.getByRole('button', { name: 'Run and import' }).click();
        const importWindow = await opened;
        await importWindow.waitForLoadState('domcontentloaded');
        // The routes come from the running app's router.
        const routes = importWindow.getByTestId('react-routes');
        await expect(routes.getByRole('button', { name: '/about' })).toBeVisible({ timeout: 30_000 });
        await expect(routes.getByRole('button', { name: '/team/:member' })).toBeDisabled();
        // A route that sends the page elsewhere is flagged, not imported blind.
        await routes.getByRole('button', { name: '/private' }).click();
        await expect(importWindow.getByTestId('react-route-redirect')).toContainText('/private');
        // A route with a param asks for it first.
        await routes.getByLabel('/team/:member: member').fill('ada');
        await expect(routes.getByRole('button', { name: '/team/:member' })).toBeEnabled();
        await routes.getByRole('button', { name: '/about' }).click();
        await expect(importWindow.getByLabel('Address')).toHaveValue(/\/about$/);
        await expect(routes.getByRole('button', { name: '/about' })).toHaveAttribute('aria-current', 'page');
        await expect(importWindow.getByTestId('react-route-redirect')).toHaveCount(0);
        const importButton = importWindow.getByRole('button', { name: 'Import', exact: true });
        await expect(importButton).toBeEnabled();
        await importButton.click();
        await expect(importWindow.getByText(/Imported/)).toBeVisible({ timeout: 30_000 });
        // Named after the route, not the page's title, which every route shares.
        await expect.poll(async () => project.viewExists('About'), { timeout: 15_000 }).toBe(true);
        const { tsx } = await project.readView('About');
        expect(tsx).toContain('About us');
        expect(tsx).toContain('<nav');
        // Closing the import window stops the app's dev server.
        const address = new URL(await importWindow.getByLabel('Address').inputValue()).origin;
        await importWindow.close();
        await expect
            .poll(async () => fetch(address).then(() => 'up', () => 'down'), { timeout: 15_000 })
            .toBe('down');
    }
    finally {
        await fs.rm(appDir, { recursive: true, force: true });
    }
});
test('imports several routes into a new project, and removes them in one step', async ({ app, window }) => {
    const appDir = await copyFixtureApp();
    const projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-projects-'));
    try {
        await expect(pageRoot(window)).toBeVisible();
        await window.evaluate((dir) => globalThis.scamp
            .setDefaultProjectsFolder(dir), projectsDir);
        await openPagesSection(window);
        await stubOpenDialog(app, appDir);
        await window.getByRole('button', { name: /Import a React app/ }).click();
        const dialog = window.getByTestId('react-import-dialog');
        await dialog.getByRole('button', { name: 'Choose folder…' }).click();
        // A new project is the default once there's somewhere to make one.
        await expect(dialog.getByRole('radio', { name: /A new project/ })).toBeChecked();
        await expect(dialog).toContainText('fixture-react-app');
        const opened = app.waitForEvent('window');
        await dialog.getByRole('button', { name: 'Run and import' }).click();
        const importWindow = await opened;
        await importWindow.waitForLoadState('domcontentloaded');
        const newProject = path.join(projectsDir, 'fixture-react-app');
        const routes = importWindow.getByTestId('react-routes');
        await expect(routes.getByRole('button', { name: '/about' })).toBeVisible({ timeout: 30_000 });
        // Pages that open as they stand are ticked; one that needs a value isn't.
        await expect(routes.getByRole('checkbox', { name: 'Import /about' })).toBeChecked();
        await expect(routes.getByRole('checkbox', { name: 'Import /team/:member' })).not.toBeChecked();
        await routes.getByRole('checkbox', { name: 'Import /team/:member' }).check();
        await routes.getByLabel('/team/:member: member').fill('ada');
        // /, /about, /team/ada and /private, which redirects and is left out.
        await routes.getByRole('button', { name: 'Import 4 pages' }).click();
        const batch = importWindow.getByTestId('import-batch');
        await expect(batch).toContainText('Imported 3 of 4 pages', { timeout: 120_000 });
        await expect(batch).toContainText('Went elsewhere');
        const viewExists = (name) => fs.access(path.join(newProject, 'views', name, `${name}.tsx`)).then(() => true, () => false);
        // A new project starts with its own Home, so the app's `/` is Home2.
        expect(await viewExists('Home2')).toBe(true);
        expect(await viewExists('About')).toBe(true);
        expect(await viewExists('TeamDetail')).toBe(true);
        expect(await viewExists('Private')).toBe(false);
        // The app window is on the new project now.
        await expect(window.getByText('fixture-react-app').first()).toBeVisible();
        // The app's own components, found across the pages: the shell every
        // page shares, with each page's content in its slot, and the card.
        await expect(batch.getByTestId('import-batch-components')).toContainText('Shell (3 copies)', { timeout: 30_000 });
        await expect(batch.getByTestId('import-batch-components')).toContainText('Page (3 copies)');
        const componentExists = (name) => fs.access(path.join(newProject, 'components', name, `${name}.tsx`)).then(() => true, () => false);
        expect(await componentExists('Shell')).toBe(true);
        const about = await fs.readFile(path.join(newProject, 'views', 'About', 'About.tsx'), 'utf-8');
        expect(about).toContain('<Shell');
        expect(about).toContain('<Page');
        expect(about).not.toContain('<nav');
        const shell = await fs.readFile(path.join(newProject, 'components', 'Shell', 'Shell.tsx'), 'utf-8');
        expect(shell).toContain('{children}');
        // The team page's list, drawn with `.map()`, is one repeated row now.
        await expect(batch.getByTestId('import-batch-repeats')).toContainText('members (3 rows)');
        const team = await fs.readFile(path.join(newProject, 'views', 'TeamDetail', 'TeamDetail.tsx'), 'utf-8');
        expect(team).toContain('members.map((member) =>');
        expect(team).toContain('Grace');
        expect(team.match(/<li /g)?.length).toBe(1);
        // Which nav item is highlighted differs by page; the report says so.
        await batch.getByText(/kept as copies or simplified/).click();
        await expect(batch).toContainText('Shell looks different on some pages');
        // One step removes everything it made.
        await batch.getByRole('button', { name: 'Remove these pages' }).click();
        await expect(batch).toContainText('Removed 3 pages and 2 components');
        expect(await componentExists('Shell')).toBe(false);
        await expect.poll(() => viewExists('About')).toBe(false);
        expect(await viewExists('Home2')).toBe(false);
        // Only what the import made: the project's own Home stays.
        expect(await viewExists('Home')).toBe(true);
        await importWindow.close();
    }
    finally {
        await fs.rm(appDir, { recursive: true, force: true });
        await fs.rm(projectsDir, { recursive: true, force: true });
    }
});
test('says when a folder is not a React app it can import', async ({ app, window }) => {
    const notReact = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-not-react-'));
    try {
        await fs.writeFile(path.join(notReact, 'package.json'), JSON.stringify({ dependencies: { vue: '3' } }));
        await expect(pageRoot(window)).toBeVisible();
        await openPagesSection(window);
        await stubOpenDialog(app, notReact);
        await window.getByRole('button', { name: /Import a React app/ }).click();
        const dialog = window.getByTestId('react-import-dialog');
        await dialog.getByRole('button', { name: 'Choose folder…' }).click();
        await expect(dialog).toContainText('doesn’t depend on React');
        await expect(dialog.getByRole('button', { name: 'Run and import' })).toHaveCount(0);
    }
    finally {
        await fs.rm(notReact, { recursive: true, force: true });
    }
});
