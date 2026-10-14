import { promises as fs } from 'fs';
import path from 'path';
import { test, expect, stubOpenDialog, writeFixtureImageOutside } from '../fixtures/app';
import { clickInFrame, dragInFrame, selectTool } from '../fixtures/canvas';
import { canvasElementsByPrefix, pageRoot, } from '../fixtures/selectors';
import { readPageFiles, waitForSaved } from '../fixtures/assertions';
/**
 * The image tool (`I`) opens a native file picker. We stub
 * `dialog.showOpenDialog` in the main process so the picker resolves
 * to a fixture PNG written into the project temp dir.
 */
test.describe('canvas: draw image', () => {
    test('I + click drops a default-sized <img> with the picked file', async ({ window, app, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        const fixturePath = await writeFixtureImageOutside('pixel.png');
        await stubOpenDialog(app, fixturePath);
        // Activate the image tool, then click on the canvas. The image
        // tool resolves the file picker before placing — wait for the
        // resulting <img> rather than asserting on the click position.
        await selectTool(window, 'i');
        await clickInFrame(window, { x: 200, y: 200 });
        const img = canvasElementsByPrefix(window, 'img_').first();
        await expect(img).toBeVisible({ timeout: 10_000 });
        const className = await img.getAttribute('data-scamp-id');
        expect(className).toMatch(/^img_/);
        await waitForSaved(window);
        const { tsx } = await readPageFiles(project.dir, project.pageName);
        expect(tsx).toMatch(new RegExp(`<img [^>]*data-scamp-id="${className}"[^>]*src="[^"]+"`));
        // Imports are re-encoded to WebP on the way in. Asserting only that
        // SOME src is emitted would pass unchanged if conversion silently
        // stopped happening — and this is the only import path the picker
        // drives directly. see docs/archive/2026-08-14-image-import-speed-plan.md
        expect(tsx).toMatch(new RegExp(`data-scamp-id="${className}"[^>]*src="[^"]*\\.webp"`));
        // Legacy projects keep assets at the root; Next.js and framework
        // projects serve them from public/assets.
        const assetsDir = project.format === 'legacy' ? 'assets' : path.join('public', 'assets');
        const assets = await fs.readdir(path.join(project.dir, assetsDir));
        expect(assets).toEqual(['pixel.webp']);
    });
    test('I + drag draws an <img> sized to the dragged box', async ({ window, app, project, }) => {
        await expect(pageRoot(window)).toBeVisible();
        const fixturePath = await writeFixtureImageOutside('pixel.png');
        await stubOpenDialog(app, fixturePath);
        await selectTool(window, 'i');
        await dragInFrame(window, { x: 100, y: 100 }, { x: 300, y: 250 });
        const img = canvasElementsByPrefix(window, 'img_').first();
        await expect(img).toBeVisible({ timeout: 10_000 });
        await waitForSaved(window);
        // The drawn img should be roughly the dragged width — within a few
        // pixels of 200 (the drag was 100 → 300).
        const box = await img.boundingBox();
        expect(box).not.toBeNull();
        expect(Math.abs(box.width - 200)).toBeLessThan(20);
        // Converted on the way in, same as the click-to-place path.
        const { tsx } = await readPageFiles(project.dir, project.pageName);
        expect(tsx).toMatch(/<img [^>]*src="[^"]*\.webp"/);
    });
});
