import { promises as fs } from 'fs';
import { test, expect, stubOpenDialog, writeFixtureImage, writeFixtureImageOutside } from '../fixtures/app';
import { drawAndSelectRect, panelSection } from '../fixtures/panel';
import { pageRoot } from '../fixtures/selectors';
import { waitForSaved } from '../fixtures/assertions';
/**
 * Choosing an image that's already in the project's assets folder must
 * reference it, not clone it.
 *
 * `imageOps.integration.test.ts` covers the copy logic directly; this is
 * the only level that proves the whole path — the IPC handler, the
 * format-derived assets dir, and the real file dialog (stubbed) — behaves
 * the way the user actually hit the bug.
 * see docs/archive/2026-08-12-reuse-existing-assets-plan.md
 */
/** Default test projects are `legacy` format: assets at <project>/assets. */
const assetNames = async (assetsDir) => (await fs.readdir(assetsDir).catch(() => [])).sort();
test.describe('images: choosing one already in the project', () => {
    test('references the existing asset instead of duplicating it', async ({ window, app, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 260, y: 200 });
        await waitForSaved(window);
        // Seed an image that's already in the project, exactly as a previous
        // import would have left it — this is what the picker opens onto.
        await fs.mkdir(project.assetsDirPath, { recursive: true });
        const existing = await writeFixtureImage(project.assetsDirPath, 'hero.png');
        expect(await assetNames(project.assetsDirPath)).toEqual(['hero.png']);
        await stubOpenDialog(app, existing);
        const background = panelSection(window, 'Background');
        await background.getByRole('button', { name: 'Set background image' }).click();
        // The import is async (dialog → copy → re-encode); wait for it to
        // have landed, or `waitForSaved` just sees the previous save.
        await expect(background.getByRole('button', { name: 'Replace image' })).toBeVisible();
        await waitForSaved(window);
        // No hero-1.png: the folder is untouched and the CSS points at the
        // file that was already there.
        expect(await assetNames(project.assetsDirPath)).toEqual(['hero.png']);
    });
    test('stays at one file across repeated imports of the same asset', async ({ window, app, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 260, y: 200 });
        await waitForSaved(window);
        await fs.mkdir(project.assetsDirPath, { recursive: true });
        const existing = await writeFixtureImage(project.assetsDirPath, 'hero.png');
        await stubOpenDialog(app, existing);
        // The button relabels to "Replace image" once one is set, so the
        // repeat presses target that.
        const background = panelSection(window, 'Background');
        await background.getByRole('button', { name: 'Set background image' }).click();
        await waitForSaved(window);
        for (let i = 0; i < 2; i += 1) {
            await background.getByRole('button', { name: 'Replace image' }).click();
            await waitForSaved(window);
        }
        // The reported symptom was hero-1.png, then hero-2.png, and on.
        await expect
            .poll(() => assetNames(project.assetsDirPath))
            .toEqual(['hero.png']);
    });
    test('still imports an image chosen from outside the project', async ({ window, app, project, }) => {
        // The behaviour that must not regress — an external file is still
        // imported into the assets folder. It arrives as `.webp`: imports are
        // re-encoded on the way in.
        // see docs/archive/2026-08-13-image-optimization-plan.md
        await expect(pageRoot(window)).toBeVisible();
        await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 260, y: 200 });
        await waitForSaved(window);
        const outside = await writeFixtureImageOutside('outside.png');
        await stubOpenDialog(app, outside);
        const background = panelSection(window, 'Background');
        await background.getByRole('button', { name: 'Set background image' }).click();
        // Wait for the import to have landed — the button relabels once the
        // element has a background — before reading the folder.
        await expect(background.getByRole('button', { name: 'Replace image' })).toBeVisible();
        await waitForSaved(window);
        expect(await assetNames(project.assetsDirPath)).toEqual(['outside.webp']);
    });
});
