import { app, ipcMain } from 'electron';
import { promises as fs } from 'fs';
import { join } from 'path';
import { IPC } from '@shared/ipcChannels';
import { parseRecentStore, upsertRecent, setRecentFormat, removeRecentByPath, } from './recentProjectsOps';
import { allowProjectOpen } from './pathContainment';
import { attachCardMeta, mergeProjectsForDisplay } from './projectListOps';
import { hasProjectThumbnail } from './projectThumbnailOps';
import { readConfig } from './projectConfigOps';
import { scanProjectsInFolder } from './projectScan';
import { getSettings } from './settings';
const storePath = () => join(app.getPath('userData'), 'recentProjects.json');
const readStore = async () => {
    try {
        return parseRecentStore(await fs.readFile(storePath(), 'utf-8'));
    }
    catch {
        return [];
    }
};
const writeStore = async (list) => {
    await fs.writeFile(storePath(), JSON.stringify({ recentProjects: list }, null, 2), 'utf-8');
};
export const addRecentProject = async (project) => {
    const list = await readStore();
    await writeStore(upsertRecent(list, {
        name: project.name,
        path: project.path,
        format: project.format,
        lastOpened: new Date().toISOString(),
    }));
};
/**
 * Update the format of a recent-projects entry in place. Called after
 * a successful legacy → nextjs migration so the next open sees the
 * correct format without a re-detect.
 */
export const updateRecentProjectFormat = async (path, format) => {
    await writeStore(setRecentFormat(await readStore(), path, format));
};
const getWithExistence = async () => {
    const list = await readStore();
    return Promise.all(list.map(async (p) => {
        try {
            const stat = await fs.stat(p.path);
            return { ...p, exists: stat.isDirectory() };
        }
        catch {
            return { ...p, exists: false };
        }
    }));
};
const removeRecentProject = async (path) => {
    await writeStore(removeRecentByPath(await readStore(), path));
};
/**
 * The Start Screen project list: every project in the default folder
 * merged with the recent-opens store (which supplies open timestamps and
 * any projects opened from outside the default folder). Deduped by path,
 * sorted most-recently-opened first. A missing/unset default folder just
 * yields the recents — the scan contributes nothing.
 */
const listStartScreenProjects = async () => {
    const recents = await getWithExistence();
    const { defaultProjectsFolder } = await getSettings();
    const scanned = defaultProjectsFolder
        ? await scanProjectsInFolder(defaultProjectsFolder)
        : [];
    const merged = mergeProjectsForDisplay(recents, scanned);
    // Enrich each card with its per-project card color + state from
    // scamp.config.json. `readConfig` bypasses the active-project IPC guard
    // (it's the ops-level reader), so it's safe for not-yet-open projects.
    return attachCardMeta(merged, async (path) => {
        const [cfg, hasThumbnail] = await Promise.all([
            readConfig(path),
            hasProjectThumbnail(path),
        ]);
        return { cardBackground: cfg.cardBackground, state: cfg.state, hasThumbnail };
    });
};
export const registerRecentProjectsIpc = () => {
    ipcMain.handle(IPC.ProjectsList, async () => {
        const projects = await listStartScreenProjects();
        for (const p of projects)
            allowProjectOpen(p.path);
        return projects;
    });
    ipcMain.handle(IPC.RecentProjectsRemove, (_e, args) => removeRecentProject(args.path));
};
