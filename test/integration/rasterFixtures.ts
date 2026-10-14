import { promises as fs } from 'fs';
import sharp, { type Sharp } from 'sharp';

/**
 * Real PNG / JPEG / WebP bytes for the image-import tests, produced with
 * the same library the app uses — so every fixture is guaranteed
 * decodable by the code under test.
 * see docs/archive/2026-08-14-image-import-speed-plan.md
 */

export type RawImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

const toSharp = (image: RawImage): Sharp =>
  sharp(Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength), {
    raw: { width: image.width, height: image.height, channels: 4 },
  });

/**
 * Deterministic per-pixel noise. Photographic in the way that matters:
 * it doesn't compress to nothing, so the size comparisons mean something
 * rather than being an artefact of a flat test image.
 */
export const noisyImage = (width: number, height: number): RawImage => {
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = 12345;
  for (let i = 0; i < data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = seed % 256;
    data[i + 1] = (seed >> 8) % 256;
    data[i + 2] = (seed >> 16) % 256;
    data[i + 3] = 255;
  }
  return { data, width, height };
};

/** A flat, single-colour square — for the alpha and no-gain cases. */
export const flatImage = (
  width: number,
  height: number,
  alpha = 255
): RawImage => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 3] = alpha;
  }
  return { data, width, height };
};

export const pngBytes = (image: RawImage): Promise<Buffer> =>
  toSharp(image).png().toBuffer();

export const jpegBytes = (image: RawImage, quality = 95): Promise<Buffer> =>
  toSharp(image).jpeg({ quality }).toBuffer();

export const webpBytes = (image: RawImage, quality = 80): Promise<Buffer> =>
  toSharp(image).webp({ quality }).toBuffer();

/** Decode WebP back to pixels, so tests can check what was produced. */
export const decodeWebp = async (bytes: Buffer): Promise<RawImage> => {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  };
};

export const writePng = async (
  filePath: string,
  image: RawImage
): Promise<string> => {
  await fs.writeFile(filePath, await pngBytes(image));
  return filePath;
};

export const writeJpeg = async (
  filePath: string,
  image: RawImage,
  quality = 95
): Promise<string> => {
  await fs.writeFile(filePath, await jpegBytes(image, quality));
  return filePath;
};
