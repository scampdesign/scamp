import { promises as fs } from 'fs';
import { join, relative } from 'path';
/**
 * Walking a project the way Embedded Scamp reads it: its own files, never
 * installs, build output, git internals or Scamp's own folder.
 */
export const SKIPPED_DIRS = new Set(['node_modules', '.git', '.scamp', 'dist', 'build', '.next', 'out', 'coverage', '.turbo', '.vite']);
/** Project-relative paths with `/` separators, up to `limit` files. */
export const listProjectFiles = async (folder, limit = 4000) => {
    const out = [];
    const walk = async (dir) => {
        if (out.length >= limit)
            return;
        const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            if (out.length >= limit)
                return;
            if (entry.isDirectory()) {
                if (!SKIPPED_DIRS.has(entry.name) && !entry.name.startsWith('.'))
                    await walk(join(dir, entry.name));
            }
            else if (entry.isFile()) {
                out.push(relative(folder, join(dir, entry.name)).split('\\').join('/'));
            }
        }
    };
    await walk(folder);
    return out;
};
export const SOURCE_FILE = /\.(tsx?|jsx?|mjs|cjs|css|scss|sass|less|html|json|md)$/;
