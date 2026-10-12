/**
 * Defense-in-depth path containment for renderer-supplied paths. The
 * renderer hands the main process absolute paths (page files, theme,
 * config, image destinations); a compromised or buggy renderer could
 * send a path outside the open project. These helpers reject that.
 *
 * Validation is string-based: `path.resolve` collapses `..` segments,
 * then we require the result to sit inside (or exactly at) the project
 * root. It deliberately does NOT dereference symlinks — a symlink that
 * lives inside the project but points out would still pass here. The
 * chokidar `followSymlinks: false` guard and the OS permission model are
 * the backstops for that. Comparison is case-sensitive: the renderer
 * always echoes back the exact path the main process gave it, so a
 * case-folded match would only weaken the check.
 *
 * The active project root is the watcher's `watchedPath`, which is set to
 * the project root on open/create and cleared on dispose — so this is
 * fail-closed: with no project watched, every guarded path is rejected.
 */
export declare const resolveInsideProject: (inputPath: string, projectRoot: string) => string;
/**
 * Resolve `inputPath` against the currently-watched project root,
 * throwing if it escapes or if no project is open. Use at the top of
 * every IPC handler that writes (or reads) a renderer-supplied path that
 * is expected to live inside the project.
 */
export declare const assertInsideActiveProject: (inputPath: string) => string;
export declare const allowProjectOpen: (folderPath: string) => void;
export declare const assertOpenableFolder: (folderPath: string) => void;
