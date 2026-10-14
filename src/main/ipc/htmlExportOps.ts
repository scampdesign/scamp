import { promises as fs } from 'fs';
import path from 'path';

/**
 * Disk operations for the HTML export. The decisions about *what* to write
 * live in `src/renderer/lib/htmlExport.ts`; this module only puts the
 * resulting bytes on disk safely.
 *
 * see docs/archive/2026-08-27-html-export-plan.md
 */

/**
 * Dropped in the export folder so a later export can tell "this is a folder
 * I made and may overwrite" from "this is the user's Documents folder".
 */
export const EXPORT_MARKER = '.scamp-export';

/**
 * True when `relativePath` stays inside the export root.
 *
 * The paths come from the renderer, which builds them from validated page
 * names — but this is the last check before a write, and a path that
 * escaped here would let the export scribble outside the folder the user
 * chose. Rejects absolute paths, drive letters, and any `..` segment.
 */
export const isSafeRelativePath = (relativePath: string): boolean => {
  if (relativePath.length === 0) return false;
  if (path.isAbsolute(relativePath)) return false;
  if (/^[a-zA-Z]:/.test(relativePath)) return false;
  const segments = relativePath.split(/[\\/]/);
  if (segments.some((s) => s === '..')) return false;
  if (segments.some((s) => s.length === 0)) return false;
  return true;
};

export type TargetState = 'empty' | 'previous-export' | 'occupied';

/**
 * Classify what's already in the chosen folder, from a directory listing.
 *
 * Pure so the rule is testable without a filesystem: a folder we previously
 * exported into is safe to overwrite, an empty one is safe to fill, and
 * anything else is the user's own data and gets refused.
 */
export const classifyTarget = (
  entries: ReadonlyArray<string>
): TargetState => {
  const meaningful = entries.filter((e) => e !== '.DS_Store');
  if (meaningful.length === 0) return 'empty';
  if (meaningful.includes(EXPORT_MARKER)) return 'previous-export';
  return 'occupied';
};

/**
 * Folder name for a project's export, derived from the project name.
 *
 * The user picks where the export goes, not what it's called — picking
 * "Documents" should produce "Documents/my-site", not a refusal because
 * Documents already has things in it.
 */
export const exportFolderName = (projectName: string): string => {
  const cleaned = projectName
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[.]+/, '')
    .trim();
  return cleaned.length > 0 ? cleaned : 'scamp-export';
};

/**
 * Name for the nth attempt at claiming a folder: `site`, `site-2`, `site-3`.
 * Used when the obvious name is taken by something we didn't write.
 */
export const candidateFolderName = (base: string, attempt: number): string =>
  attempt <= 1 ? base : `${base}-${attempt}`;

/** How many names to try before giving up rather than looping forever. */
export const MAX_FOLDER_ATTEMPTS = 100;

export type ExportFile = {
  path: string;
  contents: string;
};

/** Write every file, creating parent directories as needed. */
export const writeExportFiles = async (
  targetDir: string,
  files: ReadonlyArray<ExportFile>
): Promise<void> => {
  for (const file of files) {
    if (!isSafeRelativePath(file.path)) {
      throw new Error(`Refusing to write outside the export folder: ${file.path}`);
    }
    const absolute = path.join(targetDir, file.path);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, file.contents, 'utf-8');
  }
};

/**
 * Copy the project's assets folder into the export.
 *
 * A project with no assets folder is normal, not an error — an export with
 * no images simply has nothing to copy.
 */
export const copyAssets = async (
  sourceDir: string,
  targetDir: string
): Promise<number> => {
  let entries;
  try {
    entries = await fs.readdir(sourceDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  await fs.mkdir(targetDir, { recursive: true });
  let copied = 0;
  for (const entry of entries) {
    const from = path.join(sourceDir, entry.name);
    const to = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copied += await copyAssets(from, to);
    } else if (entry.isFile()) {
      await fs.copyFile(from, to);
      copied += 1;
    }
  }
  return copied;
};

/** Record that this folder is a Scamp export, so a re-export may overwrite it. */
export const writeMarker = async (
  targetDir: string,
  projectName: string,
  exportedAt: string
): Promise<void> => {
  await fs.writeFile(
    path.join(targetDir, EXPORT_MARKER),
    `${JSON.stringify({ project: projectName, exportedAt }, null, 2)}\n`,
    'utf-8'
  );
};
