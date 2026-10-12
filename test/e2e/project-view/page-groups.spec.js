import { promises as fs } from 'fs';
import path from 'path';
import { test, expect } from '../fixtures/app';
import { clickContextMenuItem, openPageContextMenu, openPagesSection } from '../fixtures/components';
import { pageRoot, pageSidebarItem, pagesList } from '../fixtures/selectors';
/**
 * Groups in the Pages list: a layer over the list only. Pages keep their
 * files, routes, and output. see docs/plans/page-groups-plan.md
 */
test.use({ projectOptions: { format: 'nextjs', extraPages: ['about', 'pricing'] } });
const groupHeader = (window, name) => pagesList(window).locator(`[data-testid="page-group"][data-group="${name}"]`);
const storedLayout = async (dir) => JSON.parse(await fs.readFile(path.join(dir, 'scamp.config.json'), 'utf-8')).pageLayout;
const makeGroup = async (window, name) => {
    await openPagesSection(window);
    await window.getByRole('button', { name: '+ New group' }).click();
    const input = window.getByLabel('Group name');
    await input.fill(name);
    await input.press('Enter');
    await expect(groupHeader(window, name)).toBeVisible();
};
/** HTML5 drag, dispatched directly: Playwright's dragTo doesn't fire dragstart/drop. */
const dragRow = async (window, from, to, at) => {
    await window.evaluate(({ from, to, at }) => {
        const src = document.querySelector(from);
        const dst = document.querySelector(to);
        if (!src || !dst)
            throw new Error('drag source or target not found');
        const dataTransfer = new DataTransfer();
        src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
        const rect = dst.getBoundingClientRect();
        const clientY = rect.top + rect.height * (at === 'before' ? 0.1 : at === 'after' ? 0.9 : 0.5);
        const init = { bubbles: true, cancelable: true, dataTransfer, clientX: rect.left + rect.width / 2, clientY };
        dst.dispatchEvent(new DragEvent('dragover', init));
        dst.dispatchEvent(new DragEvent('drop', init));
        src.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
    }, { from, to, at });
};
test('group pages by drag and by menu, collapse the group, and find it as left after reopening', async ({ window, project, }) => {
    await expect(pageRoot(window)).toBeVisible();
    const before = { about: await project.readPage('about'), pricing: await project.readPage('pricing') };
    await makeGroup(window, 'Marketing');
    await dragRow(window, '[data-page-slug="about"]', '[data-group="Marketing"]', 'inside');
    await expect.poll(() => storedLayout(project.dir)).toContainEqual({ group: 'Marketing', pages: ['about'] });
    // The keyboard-reachable way in.
    await openPageContextMenu(window, 'pricing');
    await clickContextMenuItem(window, 'Move to Marketing');
    await expect.poll(() => storedLayout(project.dir)).toContainEqual({ group: 'Marketing', pages: ['about', 'pricing'] });
    await groupHeader(window, 'Marketing').click();
    await expect(groupHeader(window, 'Marketing')).toHaveAttribute('aria-expanded', 'false');
    await expect(pageSidebarItem(window, 'about')).toHaveCount(0);
    // Grouping is the list only: the pages' files are byte-for-byte as they were.
    expect(await project.readPage('about')).toEqual(before.about);
    expect(await project.readPage('pricing')).toEqual(before.pricing);
    // Reopen: the group comes back from the config, still collapsed on this machine.
    await window.reload();
    await expect(pageRoot(window)).toBeVisible();
    await openPagesSection(window);
    await expect(groupHeader(window, 'Marketing')).toHaveAttribute('aria-expanded', 'false');
    await groupHeader(window, 'Marketing').click();
    await expect(pageSidebarItem(window, 'about')).toBeVisible();
});
test('a renamed page stays in its group, and a dragged page can leave it', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    await makeGroup(window, 'Marketing');
    await openPageContextMenu(window, 'about');
    await clickContextMenuItem(window, 'Move to Marketing');
    await expect.poll(() => storedLayout(project.dir)).toContainEqual({ group: 'Marketing', pages: ['about'] });
    await openPageContextMenu(window, 'about');
    await clickContextMenuItem(window, 'Rename');
    const input = window.getByPlaceholder('page-name');
    await input.fill('company');
    await input.press('Enter');
    await expect(pageSidebarItem(window, 'company')).toBeVisible();
    await expect.poll(() => storedLayout(project.dir)).toContainEqual({ group: 'Marketing', pages: ['company'] });
    await dragRow(window, '[data-page-slug="company"]', '[data-page-slug="home"]', 'before');
    await expect.poll(() => storedLayout(project.dir)).toContainEqual({ group: 'Marketing', pages: [] });
    const layout = (await storedLayout(project.dir));
    expect(layout[0]).toEqual({ page: 'company' });
});
