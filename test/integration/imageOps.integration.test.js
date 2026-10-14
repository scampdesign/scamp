import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { copyImage, assetsDirFor } from '../../src/main/ipc/imageOps';
import { flatImage, noisyImage, webpBytes, writePng } from './rasterFixtures';
describe('copyImage', () => {
    let projectDir;
    let sourceDir;
    let sourcePath;
    beforeEach(async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-img-'));
        projectDir = path.join(root, 'my-project');
        sourceDir = path.join(root, 'sources');
        await fs.mkdir(projectDir);
        await fs.mkdir(sourceDir);
        sourcePath = path.join(sourceDir, 'hero.png');
        await fs.writeFile(sourcePath, 'PNG-bytes', 'utf-8');
    });
    afterEach(async () => {
        await fs.rm(path.dirname(projectDir), { recursive: true, force: true });
    });
    describe('legacy format', () => {
        it('copies into <project>/assets/ and returns ./assets/<name>', async () => {
            const result = await copyImage({ sourcePath, projectPath: projectDir }, 'legacy');
            expect(result.relativePath).toBe('./assets/hero.png');
            expect(result.fileName).toBe('hero.png');
            const dest = await fs.readFile(path.join(projectDir, 'assets', 'hero.png'), 'utf-8');
            expect(dest).toBe('PNG-bytes');
        });
        it('deduplicates filename collisions', async () => {
            await copyImage({ sourcePath, projectPath: projectDir }, 'legacy');
            const result = await copyImage({ sourcePath, projectPath: projectDir }, 'legacy');
            expect(result.fileName).toBe('hero-1.png');
            expect(result.relativePath).toBe('./assets/hero-1.png');
        });
    });
    describe('nextjs format', () => {
        it('copies into <project>/public/assets/ and returns /assets/<name>', async () => {
            const result = await copyImage({ sourcePath, projectPath: projectDir }, 'nextjs');
            expect(result.relativePath).toBe('/assets/hero.png');
            expect(result.fileName).toBe('hero.png');
            const dest = await fs.readFile(path.join(projectDir, 'public', 'assets', 'hero.png'), 'utf-8');
            expect(dest).toBe('PNG-bytes');
        });
        it('does not write to a top-level <project>/assets/ directory', async () => {
            // Defensive — dropping assets at the project root in a nextjs
            // project would produce a non-functional Next.js app.
            await copyImage({ sourcePath, projectPath: projectDir }, 'nextjs');
            const topLevelAssets = path.join(projectDir, 'assets');
            const exists = await fs
                .access(topLevelAssets)
                .then(() => true)
                .catch(() => false);
            expect(exists).toBe(false);
        });
        it('deduplicates filename collisions inside public/assets/', async () => {
            await copyImage({ sourcePath, projectPath: projectDir }, 'nextjs');
            const result = await copyImage({ sourcePath, projectPath: projectDir }, 'nextjs');
            expect(result.fileName).toBe('hero-1.png');
            expect(result.relativePath).toBe('/assets/hero-1.png');
        });
    });
});
/**
 * Re-choosing a file that's already in the assets folder must reference
 * it, not clone it. All three image pickers open in that folder, so this
 * is the common path — and the dedupe loop turns it into a duplicate
 * every single time unless the import notices.
 * see docs/archive/2026-08-12-reuse-existing-assets-plan.md
 */
describe('copyImage: a file already in the assets folder', () => {
    let projectDir;
    beforeEach(async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-img-reuse-'));
        projectDir = path.join(root, 'my-project');
        await fs.mkdir(projectDir);
    });
    afterEach(async () => {
        await fs.rm(path.dirname(projectDir), { recursive: true, force: true });
    });
    /** Put a file in the project's assets dir and return its path. */
    const seedAsset = async (format, name = 'hero.png') => {
        const dir = assetsDirFor(projectDir, format);
        await fs.mkdir(dir, { recursive: true });
        const assetPath = path.join(dir, name);
        await fs.writeFile(assetPath, 'PNG-bytes', 'utf-8');
        return assetPath;
    };
    const assetNames = async (format) => (await fs.readdir(assetsDirFor(projectDir, format))).sort();
    it('references the existing file instead of duplicating it (legacy)', async () => {
        const assetPath = await seedAsset('legacy');
        const result = await copyImage({ sourcePath: assetPath, projectPath: projectDir }, 'legacy');
        expect(result.fileName).toBe('hero.png');
        expect(result.relativePath).toBe('./assets/hero.png');
        expect(result.reused).toBe(true);
        // The assertion that actually pins the bug: no hero-1.png.
        expect(await assetNames('legacy')).toEqual(['hero.png']);
    });
    it('references the existing file instead of duplicating it (nextjs)', async () => {
        // The two formats resolve different directories, so both need proving.
        const assetPath = await seedAsset('nextjs');
        const result = await copyImage({ sourcePath: assetPath, projectPath: projectDir }, 'nextjs');
        expect(result.relativePath).toBe('/assets/hero.png');
        expect(result.reused).toBe(true);
        expect(await assetNames('nextjs')).toEqual(['hero.png']);
    });
    it('stays at one file however many times it is re-imported', async () => {
        const assetPath = await seedAsset('legacy');
        for (let i = 0; i < 3; i += 1) {
            await copyImage({ sourcePath: assetPath, projectPath: projectDir }, 'legacy');
        }
        expect(await assetNames('legacy')).toEqual(['hero.png']);
    });
    it('is not fooled by a path that reaches the asset via ..', async () => {
        // Same file, different string — the reason this compares identity
        // rather than paths.
        const assetPath = await seedAsset('legacy');
        const indirect = path.join(path.dirname(assetPath), 'sub', '..', 'hero.png');
        await fs.mkdir(path.join(path.dirname(assetPath), 'sub'), { recursive: true });
        const result = await copyImage({ sourcePath: indirect, projectPath: projectDir }, 'legacy');
        expect(result.reused).toBe(true);
        expect(await assetNames('legacy')).toEqual(['hero.png', 'sub']);
    });
    it('still copies a DIFFERENT file that happens to share the name', async () => {
        // The behaviour that must not regress — this is what the dedupe
        // loop is actually for.
        await seedAsset('legacy');
        const otherDir = path.join(path.dirname(projectDir), 'elsewhere');
        await fs.mkdir(otherDir, { recursive: true });
        const other = path.join(otherDir, 'hero.png');
        await fs.writeFile(other, 'DIFFERENT-bytes', 'utf-8');
        const result = await copyImage({ sourcePath: other, projectPath: projectDir }, 'legacy');
        expect(result.fileName).toBe('hero-1.png');
        expect(result.reused).toBe(false);
        expect(await assetNames('legacy')).toEqual(['hero-1.png', 'hero.png']);
    });
    it('still copies a same-named file from a SUBFOLDER of assets', async () => {
        // `assets/icons/hero.png` isn't the file `./assets/hero.png` refers
        // to, so reusing the reference would point at the wrong image.
        await seedAsset('legacy');
        const iconsDir = path.join(assetsDirFor(projectDir, 'legacy'), 'icons');
        await fs.mkdir(iconsDir, { recursive: true });
        const nested = path.join(iconsDir, 'hero.png');
        await fs.writeFile(nested, 'ICON-bytes', 'utf-8');
        const result = await copyImage({ sourcePath: nested, projectPath: projectDir }, 'legacy');
        expect(result.fileName).toBe('hero-1.png');
        expect(result.reused).toBe(false);
    });
    it('matches the filesystem on a case-differing path', async () => {
        // macOS APFS is case-insensitive and Linux is not, so the SAME input
        // is legitimately a duplicate on one and a distinct file on the
        // other. Assert against what the filesystem under the test actually
        // does rather than hard-coding either answer.
        const assetPath = await seedAsset('legacy');
        const upper = path.join(path.dirname(assetPath), 'HERO.PNG');
        const caseInsensitiveFs = await fs
            .access(upper)
            .then(() => true)
            .catch(() => false);
        const result = await copyImage({ sourcePath: caseInsensitiveFs ? upper : assetPath, projectPath: projectDir }, 'legacy');
        expect(result.reused).toBe(true);
        expect(await assetNames('legacy')).toEqual(['hero.png']);
        // Crucially the reference uses the on-disk casing. Emitting the
        // chosen spelling (`./assets/HERO.PNG`) would work on the macOS dev
        // machine and 404 on a case-sensitive host.
        expect(result.fileName).toBe('hero.png');
        expect(result.relativePath).toBe('./assets/hero.png');
    });
});
/**
 * Imports are re-encoded to WebP on the way in — same pixels, fewer
 * bytes. see docs/archive/2026-08-13-image-optimization-plan.md
 */
describe('copyImage: WebP conversion', () => {
    let projectDir;
    let sourceDir;
    beforeEach(async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-img-webp-'));
        projectDir = path.join(root, 'my-project');
        sourceDir = path.join(root, 'sources');
        await fs.mkdir(projectDir);
        await fs.mkdir(sourceDir);
    });
    afterEach(async () => {
        await fs.rm(path.dirname(projectDir), { recursive: true, force: true });
    });
    /** A noisy PNG — compresses like a photo rather than to nothing. */
    const writeNoisyPng = (name) => writePng(path.join(sourceDir, name), noisyImage(200, 200));
    const assetNames = async () => (await fs.readdir(assetsDirFor(projectDir, 'legacy'))).sort();
    it('imports a PNG as a smaller .webp', async () => {
        const src = await writeNoisyPng('hero.png');
        const before = (await fs.stat(src)).size;
        const result = await copyImage({ sourcePath: src, projectPath: projectDir }, 'legacy');
        expect(result.fileName).toBe('hero.webp');
        expect(result.relativePath).toBe('./assets/hero.webp');
        expect(await assetNames()).toEqual(['hero.webp']);
        const written = await fs.stat(path.join(assetsDirFor(projectDir, 'legacy'), 'hero.webp'));
        expect(written.size).toBeLessThan(before);
    });
    it('leaves an SVG alone', async () => {
        const svg = path.join(sourceDir, 'icon.svg');
        await fs.writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>');
        const result = await copyImage({ sourcePath: svg, projectPath: projectDir }, 'legacy');
        expect(result.fileName).toBe('icon.svg');
        expect(await assetNames()).toEqual(['icon.svg']);
    });
    it('leaves an existing .webp alone rather than re-encoding it', async () => {
        const src = path.join(sourceDir, 'already.webp');
        await fs.writeFile(src, await webpBytes(flatImage(32, 32)));
        const before = await fs.readFile(src);
        const result = await copyImage({ sourcePath: src, projectPath: projectDir }, 'legacy');
        expect(result.fileName).toBe('already.webp');
        // Byte-identical: a second lossy pass would only degrade it.
        const after = await fs.readFile(path.join(assetsDirFor(projectDir, 'legacy'), 'already.webp'));
        expect(after.equals(before)).toBe(true);
    });
    it('keeps the original when it is not a decodable image', async () => {
        // Must degrade to a plain copy, never fail the import.
        const fake = path.join(sourceDir, 'broken.png');
        await fs.writeFile(fake, 'not actually a png');
        const result = await copyImage({ sourcePath: fake, projectPath: projectDir }, 'legacy');
        expect(result.fileName).toBe('broken.png');
        expect(await assetNames()).toEqual(['broken.png']);
    });
    it('still reuses an asset already in the folder, without re-encoding it', async () => {
        // The story-5 guarantee, now that conversion changes the extension
        // under it: re-picking the produced .webp must stay a no-op.
        const src = await writeNoisyPng('hero.png');
        const first = await copyImage({ sourcePath: src, projectPath: projectDir }, 'legacy');
        const assetPath = path.join(assetsDirFor(projectDir, 'legacy'), first.fileName);
        const bytesBefore = await fs.readFile(assetPath);
        const second = await copyImage({ sourcePath: assetPath, projectPath: projectDir }, 'legacy');
        expect(second.reused).toBe(true);
        expect(second.fileName).toBe('hero.webp');
        expect(await assetNames()).toEqual(['hero.webp']);
        expect((await fs.readFile(assetPath)).equals(bytesBefore)).toBe(true);
    });
});
describe('assetsDirFor', () => {
    it('points to public/assets for nextjs', () => {
        expect(assetsDirFor('/p', 'nextjs')).toBe(path.join('/p', 'public', 'assets'));
    });
    it('points to assets at the project root for legacy', () => {
        expect(assetsDirFor('/p', 'legacy')).toBe(path.join('/p', 'assets'));
    });
});
