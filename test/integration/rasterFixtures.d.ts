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
/**
 * Deterministic per-pixel noise. Photographic in the way that matters:
 * it doesn't compress to nothing, so the size comparisons mean something
 * rather than being an artefact of a flat test image.
 */
export declare const noisyImage: (width: number, height: number) => RawImage;
/** A flat, single-colour square — for the alpha and no-gain cases. */
export declare const flatImage: (width: number, height: number, alpha?: number) => RawImage;
export declare const pngBytes: (image: RawImage) => Promise<Buffer>;
export declare const jpegBytes: (image: RawImage, quality?: number) => Promise<Buffer>;
export declare const webpBytes: (image: RawImage, quality?: number) => Promise<Buffer>;
/** Decode WebP back to pixels, so tests can check what was produced. */
export declare const decodeWebp: (bytes: Buffer) => Promise<RawImage>;
export declare const writePng: (filePath: string, image: RawImage) => Promise<string>;
export declare const writeJpeg: (filePath: string, image: RawImage, quality?: number) => Promise<string>;
