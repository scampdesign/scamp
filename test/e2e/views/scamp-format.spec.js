import { test, expect } from '../fixtures/app';
import { promises as fs } from 'fs';
import * as path from 'path';
import { openComponentsSection, openPagesSection } from '../fixtures/components';
import { componentSidebarItem, pageRoot, pageSidebarItem } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';
const FIXTURE = path.resolve(__dirname, '../../../node_modules/scampjs/fixtures/contract-0');
test.use({ projectOptions: { sourceDir: FIXTURE, name: 'contract-0' } });
/**
 * The published contract fixture opens as a scamp-format project: its
 * views list as pages, its components as components, the Lobby renders
 * its bindings from the samples, and nothing is rewritten on open. The
 * fixture has no node_modules, and that is not worth a banner: designing
 * doesn't need the framework installed.
 * see docs/archive/2026-09-16-framework-phase-1-plan.md, step 6
 */
test('the contract fixture opens as a scamp project and is left byte-identical', async ({ window, project, }) => {
    await openPagesSection(window);
    await expect(pageSidebarItem(window, 'home')).toBeVisible();
    await expect(pageSidebarItem(window, 'lobby')).toBeVisible();
    await expect(window.getByTestId('framework-contract-banner')).toHaveCount(0);
    // A framework project previews its views through scamp dev (phase 3); the first view is open.
    await expect(window.getByTestId('preview-button')).toBeEnabled();
    await openComponentsSection(window);
    await expect(componentSidebarItem(window, 'LinkCard')).toBeVisible();
    await expect(componentSidebarItem(window, 'RoundTag')).toBeVisible();
    const before = await project.readFile('views/Lobby/Lobby.tsx');
    const beforeCss = await project.readFile('views/Lobby/Lobby.module.css');
    await openPagesSection(window);
    await pageSidebarItem(window, 'lobby').click();
    await expect(pageRoot(window)).toBeVisible();
    // Two players in the samples → two LinkCard instances; the waiting note shows.
    await expect(window.locator('[data-scamp-instance-id="inst_2c40"]')).toHaveCount(2);
    await expect(window.locator('[data-scamp-id="waiting_note_e1f5"]')).toHaveCount(1);
    await waitForSaved(window);
    expect(await project.readFile('views/Lobby/Lobby.tsx')).toBe(before);
    expect(await project.readFile('views/Lobby/Lobby.module.css')).toBe(beforeCss);
    expect(await project.fileExists('app')).toBe(false);
});
const installFramework = async (projectDir, contract) => {
    const pkgDir = path.join(projectDir, 'node_modules', 'scampjs');
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'scampjs', version: '9.9.9', scampjs: { contract } }));
};
test('an installed framework inside the supported range shows no banner', async ({ window, project }) => {
    await installFramework(project.dir, 0);
    // Re-open picks up node_modules: reload the project through the start screen.
    await window.reload();
    await openPagesSection(window);
    await expect(pageSidebarItem(window, 'home')).toBeVisible();
    await expect(window.getByTestId('framework-contract-banner')).toHaveCount(0);
});
test('an installed framework outside the range warns before a save writes the wrong shape', async ({ window, project, }) => {
    // A scampjs newer than this build reads: the files it writes would be
    // a shape the framework doesn't understand.
    await installFramework(project.dir, 99);
    await window.reload();
    await openPagesSection(window);
    await expect(pageSidebarItem(window, 'home')).toBeVisible();
    const banner = window.getByTestId('framework-contract-banner');
    await expect(banner).toContainText('contract 99');
    await expect(banner).toContainText('before editing');
    await banner.getByRole('button', { name: 'Dismiss' }).click();
    await expect(banner).toHaveCount(0);
});
