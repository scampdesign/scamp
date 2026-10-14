import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { test, expect, stubOpenDialog } from '../fixtures/app';
import { drawAndSelectRect, panelSection } from '../fixtures/panel';
import { pageRoot } from '../fixtures/selectors';
/**
 * Importing a large photo takes a second or two. Nothing is blocked —
 * the conversion runs in a child process — but silence for that long
 * reads as a hang, so the wait is shown.
 *
 * Anchored on the element the image is going into, because that's where
 * the user is looking: the first version was a pill at the bottom edge
 * of the canvas and got missed entirely.
 * see docs/archive/2026-08-14-image-import-speed-plan.md
 */
/** A photo big enough that the conversion window is observable. */
const writeBigJpeg = async (dir) => {
    const W = 4000;
    const H = 3000;
    const raw = Buffer.alloc(W * H * 3);
    let seed = 7;
    for (let i = 0; i < raw.length; i += 1) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        raw[i] = seed % 256;
    }
    const file = path.join(dir, 'big.jpg');
    await sharp(raw, { raw: { width: W, height: H, channels: 3 } })
        .jpeg({ quality: 90 })
        .toFile(file);
    return file;
};
test.describe('images: import indicator', () => {
    test('shows over the target element while converting, then clears', async ({ window, app, }) => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-ind-'));
        try {
            await expect(pageRoot(window)).toBeVisible();
            const className = await drawAndSelectRect(window, { x: 100, y: 100 }, { x: 420, y: 320 });
            await stubOpenDialog(app, await writeBigJpeg(dir));
            const background = panelSection(window, 'Background');
            const indicator = window.getByTestId('image-import-busy');
            await expect(indicator).toHaveCount(0);
            await background
                .getByRole('button', { name: 'Set background image' })
                .click();
            await expect(indicator).toBeVisible({ timeout: 5000 });
            // Sitting on the element, not off at the edge of the canvas.
            const target = window.locator(`[data-scamp-id="${className}"]`);
            const [box, over] = await Promise.all([
                target.boundingBox(),
                indicator.boundingBox(),
            ]);
            expect(over?.x).toBeCloseTo(box.x, -1);
            expect(over?.y).toBeCloseTo(box.y, -1);
            // And it goes away when the conversion finishes.
            await expect(indicator).toHaveCount(0, { timeout: 30000 });
        }
        finally {
            await fs.rm(dir, { recursive: true, force: true });
        }
    });
});
