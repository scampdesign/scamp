import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import {
  bufferToWebpIfSmaller,
  isConvertible,
  shouldTryLossless,
  targetDimensions,
  toWebpIfSmaller,
} from '../../src/main/ipc/imageOptimize';
import {
  decodeWebp,
  flatImage,
  jpegBytes,
  noisyImage,
  pngBytes,
  writeJpeg,
  writePng,
} from './rasterFixtures';

/**
 * Real encoding of real files in a temp dir — no mocking, because "is
 * the WebP actually smaller" is the whole question and a stub can't
 * answer it. see docs/archive/2026-08-13-image-optimization-plan.md
 */

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-opt-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('isConvertible', () => {
  it('accepts the raster formats worth re-encoding', () => {
    expect(isConvertible('/a/hero.png')).toBe(true);
    expect(isConvertible('/a/hero.jpg')).toBe(true);
    expect(isConvertible('/a/hero.jpeg')).toBe(true);
  });

  it('is case-insensitive about the extension', () => {
    expect(isConvertible('/a/HERO.PNG')).toBe(true);
  });

  it('leaves webp, svg and gif alone', () => {
    // webp: re-encoding only loses quality. svg: vector. gif: animation
    // would need handling we deliberately don't have yet.
    expect(isConvertible('/a/hero.webp')).toBe(false);
    expect(isConvertible('/a/icon.svg')).toBe(false);
    expect(isConvertible('/a/loop.gif')).toBe(false);
  });
});

/**
 * Which encodes get attempted. Lossless is both the slowest and the one
 * that loses hardest on photographs — a 12MP photo took 6.7s to produce
 * 7.2MB against a 2.8MB source — so it's only worth trying where it can
 * plausibly win. see docs/archive/2026-08-14-image-import-speed-plan.md
 */
describe('shouldTryLossless', () => {
  it('tries it for a small PNG — flat UI art is where it wins', () => {
    expect(shouldTryLossless('png', 1440, 900)).toBe(true);
  });

  it('skips it for a large PNG', () => {
    // A 12MP PNG is a photograph, whatever the extension suggests.
    expect(shouldTryLossless('png', 4000, 3000)).toBe(false);
  });

  it('skips it for a JPEG at any size', () => {
    // Already lossy: a lossless re-encode preserves compression
    // artefacts at maximum cost.
    expect(shouldTryLossless('jpeg', 64, 64)).toBe(false);
    expect(shouldTryLossless('jpeg', 4000, 3000)).toBe(false);
  });

  it('keys off what actually decoded, not the extension', () => {
    // A JPEG named .png decodes as jpeg, so it's still skipped.
    expect(shouldTryLossless('jpeg', 800, 600)).toBe(false);
  });

  it('is inclusive at the boundary', () => {
    expect(shouldTryLossless('png', 2000, 2000)).toBe(true);
    expect(shouldTryLossless('png', 2001, 2000)).toBe(false);
  });
});

/**
 * The dimension cap. A 12000px source renders at ~1200-2000 CSS pixels,
 * so keeping 96 megapixels costs bytes and encode time for detail nobody
 * can see: that image was 2.94MB in 30.7s at native resolution and
 * 0.45MB in 0.67s capped. see docs/archive/2026-08-14-image-import-speed-plan.md
 */
describe('targetDimensions', () => {
  it('leaves an image already within the cap alone', () => {
    expect(targetDimensions(1440, 900)).toBeNull();
    expect(targetDimensions(3000, 2000)).toBeNull();
  });

  it('never upscales a small image', () => {
    expect(targetDimensions(320, 240)).toBeNull();
  });

  it('caps the long edge and keeps the aspect ratio', () => {
    // The real case: 12000x8002 -> 3000x2001.
    expect(targetDimensions(12000, 8002)).toEqual({ width: 3000, height: 2001 });
  });

  it('caps by whichever edge is longer, not by width', () => {
    expect(targetDimensions(2000, 8000)).toEqual({ width: 750, height: 3000 });
  });

  it('keeps a very thin image at least one pixel tall', () => {
    const t = targetDimensions(12000, 2);
    expect(t?.width).toBe(3000);
    expect(t?.height).toBeGreaterThanOrEqual(1);
  });
});

describe('toWebpIfSmaller', () => {
  it('converts a PNG to smaller WebP bytes', async () => {
    const src = await writePng(path.join(dir, 'hero.png'), noisyImage(200, 200));
    const before = (await fs.stat(src)).size;

    const result = await toWebpIfSmaller(src);
    expect(result).not.toBeNull();
    expect(result!.ext).toBe('.webp');
    expect(result!.data.length).toBeLessThan(before);
  });

  it('converts a JPEG to smaller WebP bytes', async () => {
    const src = await writeJpeg(path.join(dir, 'photo.jpg'), noisyImage(200, 200));
    const before = (await fs.stat(src)).size;

    const result = await toWebpIfSmaller(src);
    expect(result).not.toBeNull();
    expect(result!.data.length).toBeLessThan(before);
  });

  it('emits real WebP, not just renamed bytes', async () => {
    // RIFF....WEBP is the container's magic number.
    const src = await writePng(path.join(dir, 'hero.png'), noisyImage(120, 90));
    const result = await toWebpIfSmaller(src);
    const head = result!.data;
    expect(head.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(head.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });

  it('keeps the pixel dimensions of an image within the cap', async () => {
    const src = await writePng(path.join(dir, 'hero.png'), noisyImage(320, 180));
    const result = await toWebpIfSmaller(src);

    // Decode the result back and compare, rather than trusting the encoder.
    const decoded = await decodeWebp(result!.data);
    expect(decoded.width).toBe(320);
    expect(decoded.height).toBe(180);
  });

  it('preserves colour through the downscale', async () => {
    // A flat image must come back the same colour: the resampler
    // normalises by accumulated coverage, and getting that wrong shows
    // up as a darkened or washed-out result rather than a crash.
    const solid = flatImage(4000, 2000);
    for (let i = 0; i < solid.data.length; i += 4) {
      solid.data[i] = 200;
      solid.data[i + 1] = 100;
      solid.data[i + 2] = 50;
      solid.data[i + 3] = 255;
    }
    const src = await writePng(path.join(dir, 'solid.png'), solid);
    const result = await toWebpIfSmaller(src);
    const decoded = await decodeWebp(result!.data);

    // Sampled away from the edges; lossy WebP moves values slightly.
    const mid = ((decoded.height >> 1) * decoded.width + (decoded.width >> 1)) * 4;
    expect(decoded.data[mid]).toBeGreaterThan(190);
    expect(decoded.data[mid]).toBeLessThan(210);
    expect(decoded.data[mid + 1]).toBeGreaterThan(90);
    expect(decoded.data[mid + 1]).toBeLessThan(110);
    expect(decoded.data[mid + 2]).toBeGreaterThan(40);
    expect(decoded.data[mid + 2]).toBeLessThan(60);
  }, 120000);

  it('caps an oversized image to the long-edge limit', async () => {
    // 4000px wide is past the 3000 cap, so it comes back scaled with the
    // aspect ratio intact.
    const src = await writePng(
      path.join(dir, 'huge.png'),
      noisyImage(4000, 2000)
    );
    const result = await toWebpIfSmaller(src);
    const decoded = await decodeWebp(result!.data);
    expect(decoded.width).toBe(3000);
    expect(decoded.height).toBe(1500);
  }, 120000);

  it('returns null for a format we do not convert', async () => {
    const svg = path.join(dir, 'icon.svg');
    await fs.writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(await toWebpIfSmaller(svg)).toBeNull();
  });

  it('returns null rather than throwing on a file that is not an image', async () => {
    // A text file someone renamed. This runs on every import, so it must
    // degrade to "keep the original", never fail the import.
    const fake = path.join(dir, 'notreally.png');
    await fs.writeFile(fake, 'this is not a png');
    expect(await toWebpIfSmaller(fake)).toBeNull();
  });

  it('returns null when the file does not exist', async () => {
    expect(await toWebpIfSmaller(path.join(dir, 'missing.png'))).toBeNull();
  });

  it('decodes a JPEG that has been given a .png extension', async () => {
    // The extension picks which decoder to try FIRST, not the only one —
    // a mislabelled file should still import rather than silently skip
    // compression.
    const src = path.join(dir, 'actually-jpeg.png');
    await fs.writeFile(src, await jpegBytes(noisyImage(160, 160)));
    const result = await toWebpIfSmaller(src);
    expect(result).not.toBeNull();
  });

  it('never returns bytes that are bigger than the source', async () => {
    // The safety property: this runs silently, so it has to be incapable
    // of making a file worse. A tiny flat PNG is where WebP tends to lose.
    const src = await writePng(path.join(dir, 'tiny.png'), flatImage(1, 1));
    const before = (await fs.stat(src)).size;

    const result = await toWebpIfSmaller(src);
    if (result) expect(result.data.length).toBeLessThan(before);
  });

  it('preserves transparency when it does convert', async () => {
    const src = await writePng(
      path.join(dir, 'alpha.png'),
      flatImage(64, 64, 128)
    );
    const result = await toWebpIfSmaller(src);
    if (result) {
      const decoded = await decodeWebp(result.data);
      // Alpha survived the round trip rather than being flattened to 255.
      expect(decoded.data[3]).toBeLessThan(255);
    }
  });
});

/**
 * The reason the encode moved to a worker thread at all.
 *
 * WASM runs synchronously on the calling thread. Run on the main thread,
 * a 12MP import froze the entire app — no IPC, no saves, no redraw — for
 * around nine seconds. see docs/archive/2026-08-14-image-import-speed-plan.md
 */
describe('the encode does not block the event loop', () => {
  it('keeps timers firing while a large image converts', async () => {
    const src = await writePng(
      path.join(dir, 'big.png'),
      noisyImage(1200, 900)
    );

    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 10);
    const started = Date.now();
    const result = await toWebpIfSmaller(src);
    const elapsed = Date.now() - started;
    clearInterval(timer);

    expect(result).not.toBeNull();
    // On the main thread this was exactly zero, however long the encode
    // took. A conservative floor rather than a tight count, so the test
    // doesn't turn into a timing assertion.
    expect(elapsed).toBeGreaterThan(50);
    expect(ticks).toBeGreaterThan(1);
  }, 60000);
});

describe('bufferToWebpIfSmaller', () => {
  it('shrinks a PNG buffer — the clipboard-paste case', async () => {
    // Electron's `toDataURL()` always hands back PNG, so a pasted photo
    // arrives re-encoded as PNG and can be far larger than its source.
    const png = await pngBytes(noisyImage(200, 200));
    const result = await bufferToWebpIfSmaller(png);
    expect(result).not.toBeNull();
    expect(result!.data.length).toBeLessThan(png.length);
  });

  it('returns null on bytes that are not an image', async () => {
    expect(await bufferToWebpIfSmaller(Buffer.from('nope'))).toBeNull();
  });
});
