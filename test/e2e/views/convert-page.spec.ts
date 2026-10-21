import { test, expect } from '../fixtures/app';
import {
  clickContextMenuItem,
  confirmDialog,
  createPageFromSidebar,
  openPageContextMenu,
  waitForConfirmDialog,
} from '../fixtures/components';
import { drawAndSelectRect } from '../fixtures/panel';
import { pageRoot, pageSidebarItem } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';

test.use({ projectOptions: { format: 'nextjs' } });

/**
 * Convert a page to a view: its elements move to views/<Name>/ in the
 * component file shape, and the page file becomes the one-line wrapper
 * that previews the view at the same route.
 * see docs/archive/2026-09-16-framework-phase-1-plan.md, step 2
 */
test.describe('convert a page to a view', () => {
  test('moves the page into views/ and leaves a wrapper at the route', async ({
    window,
    project,
  }) => {
    await expect(pageRoot(window)).toBeVisible();
    // Draw on home, then add a second page so the project keeps a page
    // after home converts.
    const rectId = await drawAndSelectRect(window, { x: 80, y: 80 }, { x: 240, y: 200 });
    await waitForSaved(window);
    await createPageFromSidebar(window, 'about');
    await expect(pageSidebarItem(window, 'about')).toBeVisible();

    await openPageContextMenu(window, 'home');
    await clickContextMenuItem(window, 'Convert to view');
    await waitForConfirmDialog(window, /Convert "home" to a view/);
    await confirmDialog(window, /^Convert to view$/);

    // The page reopens as a view: same slug in the list, no component banner.
    await expect(window.getByTitle('Select page root')).toHaveText('home');
    await expect(window.getByRole('navigation', { name: 'Component editor breadcrumb' })).toHaveCount(0);
    await expect(pageSidebarItem(window, 'home')).toBeVisible();

    // The elements travelled, in the contract shape, without the page-root floor.
    expect(await project.viewExists('Home')).toBe(true);
    const { tsx, css } = await project.readView('Home');
    expect(tsx).toContain(`data-scamp-id="${rectId}"`);
    expect(tsx).toContain('export default function Home({ className }: HomeProps)');
    expect(tsx).toContain('export const _scamp = { contract: 2, events: [] } as const;');
    expect(css).toContain(`.${rectId}`);
    expect(css).not.toContain('min-height: 100vh');

    // The root page file is now the wrapper and its CSS module is gone.
    const wrapper = await project.readFile('app/page.tsx');
    expect(wrapper).toContain("import Home from '@/views/Home/Home';");
    expect(await project.fileExists('app/page.module.css')).toBe(false);
    await expect(pageSidebarItem(window, 'about')).toBeVisible();
  });

  test('takes a snapshot first', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    // Home is the fixture's legacy page; converting it takes a snapshot first.
    await waitForSaved(window);
    await openPageContextMenu(window, 'home');
    await clickContextMenuItem(window, 'Convert to view');
    await waitForConfirmDialog(window, /Convert "home" to a view/);
    await confirmDialog(window, /^Convert to view$/);
    await expect(window.getByTitle('Select page root')).toHaveText('home');

    const snapshots = await project.listSnapshotLabels();
    expect(snapshots).toContain('Before converting "home" to a view');
  });
});
