import { promises as fs } from 'fs';
import { createRequire } from 'module';
import { fork, type ChildProcess } from 'child_process';
import { tmpdir } from 'os';
import { extname, join } from 'path';

/**
 * Re-encode an imported image to WebP, when that actually helps.
 *
 * Same pixels, fewer bytes — no resizing. Imports land in the project
 * byte-for-byte otherwise, so a 4MB camera JPEG is served at 4MB and
 * backed up at 4MB.
 *
 * Uses the WebAssembly codecs rather than a native encoder. libvips —
 * what sharp is built on — is a GObject library, and Chromium on Linux
 * uses GLib too; the two corrupt each other's GObject state and take the
 * main process down after a handful of encodes. WASM shares nothing with
 * the host, so it can't have that conflict.
 * see docs/archive/2026-08-13-image-optimization-plan.md
 */

/** Quality for the lossy encode. 80 is the usual photographic sweet spot. */
const WEBP_QUALITY = 80;

/**
 * Above this, only the lossy encode is attempted.
 *
 * Lossless is for flat graphic content — screenshots, logos, UI art —
 * where it beats PNG and is pixel-identical. On a photograph it loses
 * badly AND costs the most: a 12MP photo took 6.7s to produce 7.2MB,
 * larger than its own 2.8MB source, so the result was always going to be
 * discarded. Flat art that benefits is small; photographs are big.
 */
const LOSSLESS_MAX_PIXELS = 4_000_000;

/**
 * Longest edge we keep. A 12000px-wide photo renders at maybe 1200-2000
 * CSS pixels — roughly 2400-4000 device pixels on a retina screen at full
 * bleed — so everything above this is bytes and encode time spent on
 * detail nobody can see. 3000 covers 2x retina at a 1440 canvas with
 * headroom.
 *
 * Measured on a 96MP (12000x8002) source: 2.94MB in 30.7s at native
 * resolution, 0.45MB in 0.67s capped. Quality alone fixes neither — q70
 * at native is still 2.18MB and 28s.
 * see docs/archive/2026-08-14-image-import-speed-plan.md
 */
const MAX_LONG_EDGE = 3000;

/**
 * The size to encode at, or null to leave the image alone.
 *
 * Only ever shrinks: an image already within the cap is untouched, and
 * nothing is upscaled. Aspect ratio is preserved, so the short edge is
 * rounded rather than forced.
 */
export const targetDimensions = (
  width: number,
  height: number
): { width: number; height: number } | null => {
  const longest = Math.max(width, height);
  if (!(longest > MAX_LONG_EDGE)) return null;
  const scale = MAX_LONG_EDGE / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

/**
 * Is a lossless encode worth attempting for this image?
 *
 * A JPEG source is already lossy, so a lossless re-encode of one can only
 * preserve compression artefacts at great expense — the decoded format
 * decides this, not the file extension, since an extension can lie.
 */
export const shouldTryLossless = (
  decodedAs: 'png' | 'jpeg',
  width: number,
  height: number
): boolean =>
  decodedAs === 'png' && width * height <= LOSSLESS_MAX_PIXELS;

/**
 * Extensions worth re-encoding.
 *
 *   - `.webp` is excluded: re-encoding an existing WebP only loses
 *     quality for no gain.
 *   - `.svg` is vector; minifying it is a different job.
 *   - `.gif` is excluded for now: animated GIF → animated WebP works but
 *     needs its own handling and testing, and a silent conversion that
 *     dropped the animation would be a nasty surprise.
 */
const CONVERTIBLE = new Set(['.png', '.jpg', '.jpeg']);

export const isConvertible = (sourcePath: string): boolean =>
  CONVERTIBLE.has(extname(sourcePath).toLowerCase());

/**
 * Resolve a file inside an installed package.
 *
 * The codecs fetch their `.wasm` by URL by default, which has no answer
 * for a local file, so we hand them the bytes instead — which means
 * locating the files ourselves. `__dirname` exists in the bundled (CJS)
 * main process and resolves inside the packaged asar; the `cwd` branch
 * covers the ESM shim the tests run against.
 */
const requireFrom = createRequire(
  join(typeof __dirname === 'string' ? __dirname : process.cwd(), 'index.js')
);

/**
 * Conversion runs in a forked child process.
 *
 * sharp's engine (libvips) and Chromium both use GObject; in Electron's
 * main process they corrupt each other's state and crash the app after a
 * few encodes. In a child process libvips is the only user and it's
 * stable. It also keeps the work off the main thread, so a large import
 * never freezes the UI.
 * see docs/archive/2026-08-14-image-import-speed-plan.md
 */
type Pending = (result: Buffer | null) => void;

let child: ChildProcess | null | undefined;
let nextJobId = 0;
const pending = new Map<number, Pending>();

/** Resolve every in-flight job to "no compression" and drop the child. */
const abandonChild = (): void => {
  for (const resolve of pending.values()) resolve(null);
  pending.clear();
  child = null;
};

/**
 * Start the child, or return null if it can't run.
 *
 * `imageOptimize` is reached from `main/index.ts` via `registerImageIpc`,
 * so nothing here may throw into app startup — a failure degrades to
 * "images import uncompressed", the behaviour from before this feature.
 */
const getChild = (): ChildProcess | null => {
  if (child !== undefined) return child;
  try {
    // Both paths are resolved here rather than in the child: it runs from
    // the app bundle, where a bare `require('sharp')` wouldn't resolve.
    const script = join(
      typeof __dirname === 'string' ? __dirname : process.cwd(),
      'imageOptimizeChild.js'
    );
    const spawned = fork(script, [], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        SCAMP_SHARP_PATH: requireFrom.resolve('sharp'),
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    spawned.on(
      'message',
      (msg: { id?: number; ok?: boolean; data?: Buffer | null }) => {
        if (msg.id === undefined) return;
        const resolve = pending.get(msg.id);
        if (!resolve) return;
        pending.delete(msg.id);
        resolve(msg.ok && msg.data ? Buffer.from(msg.data) : null);
      }
    );
    // A crashed or exited child must not leave an import hanging.
    spawned.on('error', abandonChild);
    spawned.on('exit', abandonChild);
    spawned.unref();
    child = spawned;
  } catch {
    child = null;
  }
  return child;
};

const convert = async (
  sourcePath: string,
  sourceSize: number
): Promise<{ data: Buffer; ext: '.webp' } | null> => {
  const active = getChild();
  if (!active) return null;

  const id = (nextJobId += 1);
  const result = await new Promise<Buffer | null>((resolve) => {
    pending.set(id, resolve);
    try {
      active.send({
        id,
        sourcePath,
        maxLongEdge: MAX_LONG_EDGE,
        quality: WEBP_QUALITY,
        losslessMaxPixels: LOSSLESS_MAX_PIXELS,
      });
    } catch {
      pending.delete(id);
      resolve(null);
    }
  });

  if (!result) return null;
  // Never write a bigger file: this runs silently on every import, so it
  // has to be incapable of making one worse.
  if (result.length >= sourceSize) return null;
  return { data: result, ext: '.webp' };
};

/**
 * Encode `sourcePath` as WebP and return the bytes, or null to keep the
 * original.
 *
 * Null whenever converting isn't a clear win — an unconvertible type, a
 * file that isn't a decodable image, or a WebP that came out no smaller
 * than the source. That last case is the point: this runs silently on
 * every import, so it has to be incapable of making a file worse.
 */
export const toWebpIfSmaller = async (
  sourcePath: string
): Promise<{ data: Buffer; ext: '.webp' } | null> => {
  if (!isConvertible(sourcePath)) return null;
  try {
    const { size } = await fs.stat(sourcePath);
    return await convert(sourcePath, size);
  } catch {
    return null;
  }
};

/**
 * The same, for bytes with no file behind them — the clipboard-paste
 * path.
 *
 * Worth more here than on a normal import: Electron's `toDataURL()`
 * always hands back PNG, so pasting a photograph that was originally a
 * JPEG re-encodes it to PNG and can multiply its size. This is the one
 * place the pipeline used to actively inflate a file.
 */
export const bufferToWebpIfSmaller = async (
  data: Buffer
): Promise<{ data: Buffer; ext: '.webp' } | null> => {
  // The child works from a path, so clipboard bytes get a temp file.
  // Pasted images are small (a screenshot, not a 96MP original), so the
  // extra write costs nothing worth optimising away.
  const scratch = join(tmpdir(), `scamp-paste-${process.pid}-${nextJobId}.bin`);
  try {
    await fs.writeFile(scratch, data);
    return await convert(scratch, data.length);
  } catch {
    return null;
  } finally {
    await fs.unlink(scratch).catch(() => undefined);
  }
};
