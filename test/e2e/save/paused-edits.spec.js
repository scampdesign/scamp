import { test, expect } from '../fixtures/app';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';
import { openPagesSection } from '../fixtures/components';
import { pageRoot, pageSidebarItem, saveStatus } from '../fixtures/selectors';
/**
 * Edits made while sync is paused reach disk, and the indicator doesn't
 * call them saved before they do. Audit items 7 and 8 in
 * docs/plans/audit-2026-10-12.md.
 */
test.use({ projectOptions: { extraPages: ['about'] } });
const toggleSync = async (window) => {
    await saveStatus(window).click();
    await window.getByTestId('manual-sync-toggle').click();
};
const paintRoot = async (window, color) => {
    const patched = await window.evaluate((c) => {
        const w = window;
        if (!w.__scampCanvasStore)
            return false;
        const store = w.__scampCanvasStore.getState();
        store.patchElement(store.rootElementId, { backgroundColor: c });
        return true;
    }, color);
    expect(patched).toBe(true);
};
test('an edit made while paused is written when you resume', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    await toggleSync(window);
    await expect(saveStatus(window)).toHaveAttribute('data-status', 'paused');
    await paintRoot(window, '#123456');
    // Well past the 200ms debounce: still held, still not on disk.
    await window.waitForTimeout(500);
    expect((await readPageFiles(project.dir, 'home')).css).not.toContain('#123456');
    await toggleSync(window);
    await waitForSaved(window);
    await expect.poll(async () => (await readPageFiles(project.dir, 'home')).css).toContain('#123456');
});
test('an edit made while paused is written when you switch page', async ({ window, project }) => {
    await expect(pageRoot(window)).toBeVisible();
    await toggleSync(window);
    await paintRoot(window, '#654321');
    await window.waitForTimeout(500);
    await openPagesSection(window);
    await pageSidebarItem(window, 'about').click();
    await expect.poll(async () => (await readPageFiles(project.dir, 'home')).css).toContain('#654321');
});
