import { resolve, sep } from 'path';
import { getWatchedPath } from '../watcher';

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
export const resolveInsideProject = (
  inputPath: string,
  projectRoot: string
): string => {
  const root = resolve(projectRoot);
  const resolved = resolve(inputPath);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new Error(`Path "${inputPath}" is outside the active project.`);
  }
  return resolved;
};

/**
 * Resolve `inputPath` against the currently-watched project root,
 * throwing if it escapes or if no project is open. Use at the top of
 * every IPC handler that writes (or reads) a renderer-supplied path that
 * is expected to live inside the project.
 */
export const assertInsideActiveProject = (inputPath: string): string => {
  const root = getWatchedPath();
  if (root === null) {
    throw new Error('No active project; file operation rejected.');
  }
  return resolveInsideProject(inputPath, root);
};

/**
 * Folders main itself handed out: the folder picker, the start screen's
 * list, a test's auto-open. ProjectOpen accepts no other, so a renderer
 * bug can't move the project root — and every check above — to `~`.
 */
const openableFolders = new Set<string>();

export const allowProjectOpen = (folderPath: string): void => {
  openableFolders.add(resolve(folderPath));
};

export const assertOpenableFolder = (folderPath: string): void => {
  if (!openableFolders.has(resolve(folderPath))) {
    throw new Error('Choose the project folder to open it.');
  }
};
