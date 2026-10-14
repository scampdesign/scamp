import { promises as fs } from 'fs';
import { join } from 'path';
/**
 * Detect a project's on-disk format by inspecting its layout. Re-run
 * on every open so users who hand-convert a project are reflected
 * correctly without a forced cache invalidation.
 *
 *   1. `<root>/views/` + `scampjs` in package.json → scamp
 *   2. `<root>/app/page.tsx` exists  → nextjs
 *   3. any `*.tsx` at project root   → legacy
 *   4. otherwise                     → nextjs (treat as new/empty)
 *
 * Lives in its own file (no electron imports) so the test suite can
 * exercise it without dragging the electron module into vitest's node
 * environment. Kept in `src/main/ipc/` because it is a main-process
 * concern — the renderer never calls it directly.
 */
/**
 * A scamp-format project: the framework layout (`views/` at the root) and
 * `scampjs` in its dependencies. Checked before the Next.js test because
 * a migrated project may keep an `app/` folder around for a while.
 * see docs/archive/2026-09-16-framework-phase-1-plan.md, step 6
 */
const isScampFormat = async (folderPath) => {
    try {
        const stat = await fs.stat(join(folderPath, 'views'));
        if (!stat.isDirectory())
            return false;
        const raw = await fs.readFile(join(folderPath, 'package.json'), 'utf-8');
        const pkg = JSON.parse(raw);
        return Boolean(pkg.dependencies?.['scampjs'] ?? pkg.devDependencies?.['scampjs']);
    }
    catch {
        return false;
    }
};
export const detectProjectFormat = async (folderPath) => {
    if (await isScampFormat(folderPath))
        return 'scamp';
    try {
        await fs.access(join(folderPath, 'app', 'page.tsx'));
        return 'nextjs';
    }
    catch {
        // fall through
    }
    try {
        const entries = await fs.readdir(folderPath);
        if (entries.some((e) => e.endsWith('.tsx')))
            return 'legacy';
    }
    catch {
        // unreadable folder — fall through to nextjs default
    }
    return 'nextjs';
};
