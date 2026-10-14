import { promises as fs } from 'fs';
import path from 'path';
import { test, expect } from '../fixtures/app';
import { clickContextMenuItem, openPageContextMenu, openPagesSection } from '../fixtures/components';
import { waitForSaved } from '../fixtures/assertions';
import { drawAndSelectRect } from '../fixtures/panel';
import { pageRoot, pageSidebarItem, pagesList } from '../fixtures/selectors';
/**
 * Groups in the Pages list: a layer over the list only. Pages keep their
 * files, routes, and output. see docs/archive/2026-10-12-page-groups-plan.md
 */
test.use({ projectOptions: { format: 'nextjs', extraPages: ['about', 'pricing'] } });
const groupHeader = (window, name) => pagesList(window).locator(`[data-testid="page-group"][data-group="${name}"]`);
const storedLayout = async (dir) => JSON.parse(await fs.readFile(path.join(dir, 'scamp.config.json'), 'utf-8')).pageLayout;
/** Pick one page (click, then Shift+click it) and group it with Cmd+G. */
const makeGroup = async (window, name, slug) => {
    await openPagesSection(window);
    await pageSidebarItem(window, slug).click();
    await pageSidebarItem(window, slug).click({ modifiers: ['Shift'] });
    await window.keyboard.press('ControlOrMeta+g');
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
    await makeGroup(window, 'Marketing', 'about');
    await expect.poll(() => storedLayout(project.dir)).toContainEqual({ group: 'Marketing', pages: ['about'] });
    // Read after makeGroup: it opens `about`, and opening a page may tidy its
    // file to Scamp's canonical form. Nothing from here on is allowed to.
    await waitForSaved(window);
    const before = { about: await project.readPage('about'), pricing: await project.readPage('pricing') };
    await dragRow(window, '[data-page-slug="pricing"]', '[data-group="Marketing"]', 'inside');
    await expect.poll(() => storedLayout(project.dir)).toContainEqual({ group: 'Marketing', pages: ['about', 'pricing'] });
    // The keyboard-reachable way out and back in.
    await openPageContextMenu(window, 'pricing');
    await clickContextMenuItem(window, 'Move to top level');
    await expect.poll(() => storedLayout(project.dir)).toContainEqual({ group: 'Marketing', pages: ['about'] });
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
    await makeGroup(window, 'Marketing', 'about');
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
test('the group menu adds a page into it, renames it, and deletes it without deleting pages', async ({ window, project, }) => {
    await expect(pageRoot(window)).toBeVisible();
    await makeGroup(window, 'Docs', 'pricing');
    await groupHeader(window, 'Docs').click({ button: 'right' });
    await clickContextMenuItem(window, 'Add page here');
    const input = window.getByPlaceholder('page-name');
    await input.fill('guide');
    await input.press('Enter');
    await expect(pageSidebarItem(window, 'guide')).toBeVisible();
    await expect.poll(() => storedLayout(project.dir)).toContainEqual({ group: 'Docs', pages: ['pricing', 'guide'] });
    await groupHeader(window, 'Docs').click({ button: 'right' });
    await clickContextMenuItem(window, 'Rename group');
    const name = window.getByLabel('Group name');
    await name.fill('Guides');
    await name.press('Enter');
    await expect.poll(() => storedLayout(project.dir)).toContainEqual({ group: 'Guides', pages: ['pricing', 'guide'] });
    await groupHeader(window, 'Guides').click({ button: 'right' });
    await clickContextMenuItem(window, 'Delete group');
    await expect(groupHeader(window, 'Guides')).toHaveCount(0);
    await expect(pageSidebarItem(window, 'guide')).toBeVisible();
    await expect.poll(() => storedLayout(project.dir)).toContainEqual({ page: 'guide' });
});
test('Cmd+click picks pages and Cmd+G groups them, leaving the canvas’s Cmd+G alone', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    // A selected element on the canvas: the canvas's Cmd+G would wrap it.
    await drawAndSelectRect(window, { x: 80, y: 80 }, { x: 180, y: 160 });
    await waitForSaved(window);
    const canvasBefore = await project.readPage('home');
    await openPagesSection(window);
    await pageSidebarItem(window, 'about').click({ modifiers: ['ControlOrMeta'] });
    await pageSidebarItem(window, 'pricing').click({ modifiers: ['ControlOrMeta'] });
    await expect(pageSidebarItem(window, 'pricing')).toHaveAttribute('aria-pressed', 'true');
    // Cmd+click picks; it doesn't open.
    await expect(window.getByTitle('Select page root')).toHaveText('home');
    await window.keyboard.press('ControlOrMeta+g');
    const name = window.getByLabel('Group name');
    await name.fill('Marketing');
    await name.press('Enter');
    // Home was open when picking started, so it's picked too.
    await expect
        .poll(() => storedLayout(project.dir))
        .toContainEqual({ group: 'Marketing', pages: ['home', 'about', 'pricing'] });
    await window.waitForTimeout(300);
    expect(await project.readPage('home')).toEqual(canvasBefore);
});
test('right-clicking a picked page offers to group the selection', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    await openPagesSection(window);
    await pageSidebarItem(window, 'about').click({ modifiers: ['ControlOrMeta'] });
    await pageSidebarItem(window, 'home').click({ modifiers: ['ControlOrMeta'] }); // un-pick the open page
    await pageSidebarItem(window, 'pricing').click({ modifiers: ['ControlOrMeta'] });
    await pageSidebarItem(window, 'pricing').click({ button: 'right' });
    await clickContextMenuItem(window, 'Group 2 pages');
    await window.getByLabel('Group name').press('Enter');
    await expect.poll(() => storedLayout(project.dir)).toContainEqual({ group: 'Group', pages: ['about', 'pricing'] });
    await expect(pageSidebarItem(window, 'about')).toHaveAttribute('aria-pressed', 'false');
});
test('Shift+click picks the run from the last clicked page, and Cmd+G groups it', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    await openPagesSection(window);
    // A plain click opens a page and sets where a Shift+click run starts.
    await pageSidebarItem(window, 'about').click();
    await expect(window.getByTitle('Select page root')).toHaveText('about');
    await pageSidebarItem(window, 'home').click({ modifiers: ['Shift'] });
    for (const slug of ['home', 'about']) {
        await expect(pageSidebarItem(window, slug)).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(pageSidebarItem(window, 'pricing')).toHaveAttribute('aria-pressed', 'false');
    // Shift+click picks; it doesn't open.
    await expect(window.getByTitle('Select page root')).toHaveText('about');
    // A second Shift+click replaces the run, from the same start.
    await pageSidebarItem(window, 'pricing').click({ modifiers: ['Shift'] });
    await expect(pageSidebarItem(window, 'home')).toHaveAttribute('aria-pressed', 'false');
    await window.keyboard.press('ControlOrMeta+g');
    await window.getByLabel('Group name').press('Enter');
    await expect.poll(() => storedLayout(project.dir)).toContainEqual({ group: 'Group', pages: ['about', 'pricing'] });
});
