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
export declare const EXPORT_MARKER = ".scamp-export";
/**
 * True when `relativePath` stays inside the export root.
 *
 * The paths come from the renderer, which builds them from validated page
 * names — but this is the last check before a write, and a path that
 * escaped here would let the export scribble outside the folder the user
 * chose. Rejects absolute paths, drive letters, and any `..` segment.
 */
export declare const isSafeRelativePath: (relativePath: string) => boolean;
export type TargetState = 'empty' | 'previous-export' | 'occupied';
/**
 * Classify what's already in the chosen folder, from a directory listing.
 *
 * Pure so the rule is testable without a filesystem: a folder we previously
 * exported into is safe to overwrite, an empty one is safe to fill, and
 * anything else is the user's own data and gets refused.
 */
export declare const classifyTarget: (entries: ReadonlyArray<string>) => TargetState;
/**
 * Folder name for a project's export, derived from the project name.
 *
 * The user picks where the export goes, not what it's called — picking
 * "Documents" should produce "Documents/my-site", not a refusal because
 * Documents already has things in it.
 */
export declare const exportFolderName: (projectName: string) => string;
/**
 * Name for the nth attempt at claiming a folder: `site`, `site-2`, `site-3`.
 * Used when the obvious name is taken by something we didn't write.
 */
export declare const candidateFolderName: (base: string, attempt: number) => string;
/** How many names to try before giving up rather than looping forever. */
export declare const MAX_FOLDER_ATTEMPTS = 100;
export type ExportFile = {
    path: string;
    contents: string;
};
/** Write every file, creating parent directories as needed. */
export declare const writeExportFiles: (targetDir: string, files: ReadonlyArray<ExportFile>) => Promise<void>;
/**
 * Copy the project's assets folder into the export.
 *
 * A project with no assets folder is normal, not an error — an export with
 * no images simply has nothing to copy.
 */
export declare const copyAssets: (sourceDir: string, targetDir: string) => Promise<number>;
/** Record that this folder is a Scamp export, so a re-export may overwrite it. */
export declare const writeMarker: (targetDir: string, projectName: string, exportedAt: string) => Promise<void>;
