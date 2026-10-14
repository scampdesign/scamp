import { promises as fs, type Stats } from 'fs';
import { basename, extname, join, resolve } from 'path';
import { bufferToWebpIfSmaller, toWebpIfSmaller } from './imageOptimize';
import type {
  CopyImageArgs,
  CopyImageResult,
  ProjectFormat,
} from '@shared/types';

/**
 * Where image assets live on disk for a given project format.
 *
 *   - legacy: `<project>/assets/` (referenced as `./assets/<file>`)
 *   - nextjs: `<project>/public/assets/` (Next.js serves `public/`
 *     at the URL root, so the runtime reference is `/assets/<file>`)
 */
export const assetsDirFor = (
  projectPath: string,
  format: ProjectFormat
): string =>
  format === 'legacy'
    ? join(projectPath, 'assets')
    : join(projectPath, 'public', 'assets');

/**
 * The runtime reference path that lands on `el.src` / in CSS
 * `url(...)` declarations. Legacy uses a relative-to-project path so
 * exported HTML works when opened directly; nextjs uses an absolute
 * server-root path because Next.js serves `public/` at `/`.
 */
const referencePathFor = (
  fileName: string,
  format: ProjectFormat
): string =>
  format === 'legacy' ? `./assets/${fileName}` : `/assets/${fileName}`;

/** `fs.stat`, or null when the path doesn't exist. */
const statOrNull = async (path: string): Promise<Stats | null> => {
  try {
    return await fs.stat(path);
  } catch {
    return null;
  }
};

/**
 * Are these two paths the same file on disk?
 *
 * Asks the filesystem (device + inode) rather than comparing path
 * strings, because strings lie: `..` segments, symlinks and trailing
 * slashes all describe the same file differently, and case is worse
 * still — on macOS's case-insensitive APFS `/Assets/Hero.png` IS
 * `/assets/hero.png`, while on Linux those are two different files. A
 * string compare has to be wrong on one platform or the other; identity
 * is right on both.
 *
 * Windows doesn't reliably populate `ino`, so it falls back to a
 * case-insensitive path compare — which is the correct semantic there,
 * NTFS being case-insensitive.
 * see docs/archive/2026-08-12-reuse-existing-assets-plan.md
 */
const isSameFile = async (a: string, b: string): Promise<boolean> => {
  const [statA, statB] = await Promise.all([statOrNull(a), statOrNull(b)]);
  if (!statA || !statB) return false;
  if (statA.ino !== 0 && statB.ino !== 0) {
    return statA.dev === statB.dev && statA.ino === statB.ino;
  }
  return resolve(a).toLowerCase() === resolve(b).toLowerCase();
};

/**
 * The name the asset actually has on disk, given a name that refers to
 * it.
 *
 * Only differs from the input on a case-insensitive filesystem: picking
 * `HERO.PNG` on macOS resolves to the file stored as `hero.png`, and
 * emitting the chosen spelling would write `./assets/HERO.PNG` into the
 * TSX — a reference that works on the dev machine and 404s the moment
 * it's served from a case-sensitive host. A directory listing is the
 * only way to learn the real casing.
 */
const canonicalAssetName = async (
  assetsDir: string,
  fileName: string
): Promise<string> => {
  const entries = await fs.readdir(assetsDir).catch(() => [] as string[]);
  if (entries.includes(fileName)) return fileName;
  const lower = fileName.toLowerCase();
  return entries.find((e) => e.toLowerCase() === lower) ?? fileName;
};

/**
 * Copy an image into the project's assets folder, deduplicating the
 * filename if it collides. Pure with respect to `format` — the caller
 * (`registerImageIpc`) reads it from the project format cache.
 *
 * **May not copy at all.** When the chosen file already IS the asset at
 * the destination path, it's returned as-is (`reused: true`). Without
 * that check the dedupe loop below doesn't just fail to notice — it
 * guarantees a duplicate, since the destination is occupied by the very
 * file being imported. All three image pickers open in the assets
 * folder, so re-choosing an existing asset is a common action.
 *
 * Returns the runtime reference path as `relativePath` (the field name
 * predates the nextjs format, where the path is actually absolute
 * server-root; kept for compatibility with existing call sites).
 */
export const copyImage = async (
  args: CopyImageArgs,
  format: ProjectFormat
): Promise<CopyImageResult> => {
  const assetsDir = assetsDirFor(args.projectPath, format);
  await fs.mkdir(assetsDir, { recursive: true });

  const sourceExt = extname(args.sourcePath);
  const base = basename(args.sourcePath, sourceExt);

  // Already the asset at this path — reference it, don't clone it, and
  // above all don't re-encode it. The reference uses the name as stored
  // on disk, not as the user typed it.
  if (await isSameFile(args.sourcePath, join(assetsDir, `${base}${sourceExt}`))) {
    const actualName = await canonicalAssetName(assetsDir, `${base}${sourceExt}`);
    return {
      relativePath: referencePathFor(actualName, format),
      fileName: actualName,
      reused: true,
    };
  }

  // Only a file coming from OUTSIDE the assets folder is re-encoded: the
  // check above has already claimed everything that's merely being
  // re-linked. `null` means keeping the original is the better outcome.
  const converted = await toWebpIfSmaller(args.sourcePath);
  const ext = converted?.ext ?? sourceExt;

  // Deduplicate against the name we'll actually write: hero.png →
  // hero.webp → hero-1.webp.
  let fileName = `${base}${ext}`;
  let destPath = join(assetsDir, fileName);
  let counter = 1;
  while (true) {
    try {
      await fs.access(destPath);
      fileName = `${base}-${counter}${ext}`;
      destPath = join(assetsDir, fileName);
      counter += 1;
    } catch {
      break; // File doesn't exist — safe to use this name.
    }
  }

  if (converted) {
    await fs.writeFile(destPath, converted.data);
  } else {
    await fs.copyFile(args.sourcePath, destPath);
  }
  return {
    relativePath: referencePathFor(fileName, format),
    fileName,
    reused: false,
  };
};

/**
 * Write an in-memory image buffer into the project's assets folder
 * (deduplicating the filename), returning the runtime reference. Used by
 * the clipboard-paste path, where there's no source file to copy.
 */
export const saveImageBuffer = async (
  projectPath: string,
  data: Buffer,
  baseName: string,
  sourceExt: string,
  format: ProjectFormat
): Promise<CopyImageResult> => {
  const assetsDir = assetsDirFor(projectPath, format);
  await fs.mkdir(assetsDir, { recursive: true });

  const converted = await bufferToWebpIfSmaller(data);
  const bytes = converted?.data ?? data;
  const ext = converted?.ext ?? sourceExt;

  let fileName = `${baseName}${ext}`;
  let destPath = join(assetsDir, fileName);
  let counter = 1;
  while (true) {
    try {
      await fs.access(destPath);
      fileName = `${baseName}-${counter}${ext}`;
      destPath = join(assetsDir, fileName);
      counter += 1;
    } catch {
      break;
    }
  }

  await fs.writeFile(destPath, bytes);
  return {
    relativePath: referencePathFor(fileName, format),
    fileName,
    reused: false,
  };
};
