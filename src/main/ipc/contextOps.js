import { promises as fs } from 'fs';
import { dirname, join } from 'path';
/**
 * The live agent-context file at `<project>/.scamp/context.md`.
 *
 * Lives under `.scamp/` for two reasons, both load-bearing: the scaffolded
 * `.gitignore` already excludes that folder, and the file watcher excludes
 * every dotfile path (`watcher.ts`). Move it and Scamp would see its own
 * write as an external edit — pausing the sync bridge and auto-snapshotting
 * on every click. see docs/archive/2026-08-05-live-context-file-plan.md
 */
export const contextFilePath = (projectPath) => join(projectPath, '.scamp', 'context.md');
/**
 * Write the context file. Best-effort by design: a failed write (disk full,
 * permissions, project folder removed mid-session) is never worth
 * interrupting the user for, and the next selection tries again.
 */
export const writeContextFile = async (args) => {
    const path = contextFilePath(args.projectPath);
    try {
        await fs.mkdir(dirname(path), { recursive: true });
        await fs.writeFile(path, args.content, 'utf-8');
    }
    catch {
        // Intentionally silent — see above.
    }
};
