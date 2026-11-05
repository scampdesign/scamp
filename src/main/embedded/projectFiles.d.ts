/**
 * Walking a project the way Embedded Scamp reads it: its own files, never
 * installs, build output, git internals or Scamp's own folder.
 */
export declare const SKIPPED_DIRS: Set<string>;
/** Project-relative paths with `/` separators, up to `limit` files. */
export declare const listProjectFiles: (folder: string, limit?: number) => Promise<string[]>;
export declare const SOURCE_FILE: RegExp;
