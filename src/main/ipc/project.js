import { app, dialog, ipcMain } from 'electron';
import { promises as fs } from 'fs';
import { basename, dirname, join } from 'path';
import { IPC } from '@shared/ipcChannels';
import { DEFAULT_THEME_CSS } from '@shared/agentMd';
import { validateProjectName } from '@shared/projectName';
import { addRecentProject, updateRecentProjectFormat, } from './recentProjects';
import { getSettings } from './settings';
import { watchProject } from '../watcher';
import { setSentryProjectRoot } from '../sentry';
import { startMcpForProject } from '../mcp/lifecycle';
import { setActiveImportProject } from '../importSourceStore';
import { ensureProjectConfig } from './projectConfig';
import { detectProjectFormat } from './projectFormat';
import { setCachedProjectFormat } from './projectFormatCache';
import { allowProjectOpen, assertInsideActiveProject, assertOpenableFolder } from './pathContainment';
import { ensureThemeDefaultsIfNeeded, ensureTsConfigIfNeeded, readProjectComponentsAndViews, readProjectLegacy, readProjectNextjs, refreshAgentMdIfNeeded, refreshLayoutTemplateIfNeeded, SCAFFOLDED_SCAMPJS_RANGE, scaffoldLegacyProject, scaffoldNextjsProject, scaffoldScampProject, themePathFor, } from './projectScaffold';
import { migrateLegacyToNextjs, migrateNextjsToScamp } from './projectMigrate';
import { readFrameworkInfo } from './frameworkVersion';
import { listRoutes } from './routeOps';
import { createSnapshot } from './snapshotOps';
export { detectProjectFormat };
export { scaffoldLegacyProject, scaffoldNextjsProject };
/**
 * Where the folder picker opens. Electron 43+ points an omitted
 * `defaultPath` at ~/Downloads and stops the OS restoring the last-used
 * directory, so we track it ourselves.
 * see docs/plans/electron-upgrade-plan.md
 */
let lastProjectDir = null;
const projectDialogDefault = async () => {
    if (lastProjectDir !== null)
        return lastProjectDir;
    const { defaultProjectsFolder } = await getSettings();
    return defaultProjectsFolder ?? app.getPath('home');
};
const chooseFolder = async () => {
    const result = await dialog.showOpenDialog({
        title: 'Choose project folder',
        defaultPath: await projectDialogDefault(),
        properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, path: null };
    }
    const chosen = result.filePaths[0] ?? null;
    if (chosen !== null) {
        lastProjectDir = dirname(chosen);
        allowProjectOpen(chosen);
    }
    return { canceled: false, path: chosen };
};
const readProject = async (folderPath) => {
    const format = await detectProjectFormat(folderPath);
    setCachedProjectFormat(folderPath, format);
    // A scamp-format project has no pages: every page is a view.
    const pages = format === 'scamp'
        ? []
        : format === 'nextjs'
            ? await readProjectNextjs(folderPath)
            : await readProjectLegacy(folderPath);
    // Components require the Next.js layout (the `components/` folder
    // sits at the project root alongside `app/`). Legacy projects
    // return an empty list — see `docs/plans/2026-05-17-components.md`
    // for the rationale.
    const components = format === 'legacy' ? [] : await readProjectComponentsAndViews(folderPath);
    const framework = format === 'scamp' ? await readFrameworkInfo(folderPath) : undefined;
    const routes = format === 'scamp' ? await listRoutes(folderPath) : undefined;
    const hasDatabase = format === 'scamp'
        ? await fs
            .access(join(folderPath, 'lib', 'db.ts'))
            .then(() => true, () => false)
        : undefined;
    return {
        path: folderPath,
        name: basename(folderPath),
        format,
        pages,
        components,
        ...(framework ? { framework } : {}),
        ...(routes ? { routes } : {}),
        ...(hasDatabase !== undefined ? { hasDatabase } : {}),
    };
};
const createProject = async (args) => {
    // Re-validate the name on the main side — never trust the renderer.
    const result = validateProjectName(args.name);
    if (!result.ok)
        throw new Error(result.error);
    const name = result.value;
    // The parent must exist; we don't auto-create it because that's the
    // user's "default projects folder" and creating it silently would mask
    // a misconfiguration.
    try {
        const stat = await fs.stat(args.parentPath);
        if (!stat.isDirectory()) {
            throw new Error(`Parent path is not a directory: ${args.parentPath}`);
        }
    }
    catch (e) {
        if (e instanceof Error && e.message.startsWith('Parent path is not'))
            throw e;
        throw new Error(`Parent folder does not exist: ${args.parentPath}`);
    }
    const projectPath = join(args.parentPath, name);
    // Refuse to write into a folder that already exists. The user can pick
    // a different name; we never want to silently merge into a stranger's
    // folder.
    try {
        await fs.access(projectPath);
        throw new Error(`A folder named "${name}" already exists at ${args.parentPath}.`);
    }
    catch (e) {
        if (e instanceof Error && e.message.startsWith('A folder named'))
            throw e;
        // ENOENT — proceed
    }
    await fs.mkdir(projectPath, { recursive: false });
    const format = args.format ?? 'scamp';
    if (format === 'scamp') {
        await scaffoldScampProject(projectPath, name);
    }
    else {
        await scaffoldNextjsProject(projectPath, name);
    }
    await ensureProjectConfig(projectPath);
    setCachedProjectFormat(projectPath, format);
    await addRecentProject({ name, path: projectPath, format });
    await watchProject(projectPath);
    setSentryProjectRoot(projectPath);
    await startMcpForProject(projectPath);
    // Opening a different project drops the last one's kept originals:
    // they are scratch for tidying up an import, not project state.
    await setActiveImportProject(projectPath);
    return readProject(projectPath);
};
const openProject = async (args) => {
    assertOpenableFolder(args.folderPath);
    const project = await readProject(args.folderPath);
    // Session-open snapshot: capture the project's pre-open on-disk state
    // (whatever changed externally between sessions) BEFORE the canvas
    // loads and before Scamp's own open-time scaffolding writes below.
    // Fire-and-forget + silent — never delay the canvas load. The
    // scaffolding writes (theme.css / layout.tsx / agent.md) don't touch
    // snapshotted page/component files, so there's no race on captured
    // content. See docs/notes/snapshots.md.
    void createSnapshot(args.folderPath, project.format, 'session_open');
    // Ensure older projects get a theme.css if they don't have one.
    // For nextjs the file lives at `app/theme.css` (the `app/` folder
    // exists by virtue of detection having found a `page.tsx` inside it).
    // For legacy it's at the project root.
    const themePath = themePathFor(args.folderPath, project.format);
    try {
        await fs.access(themePath);
    }
    catch {
        await fs
            .writeFile(themePath, DEFAULT_THEME_CSS, 'utf-8')
            .catch(() => undefined);
    }
    // Backfill scamp.config.json with defaults for projects created
    // before per-project settings existed.
    await ensureProjectConfig(args.folderPath);
    // Refresh `app/layout.tsx` to the latest template when the project
    // still uses a known earlier version. User-customised layouts are
    // left alone; a warning logs to the main process so users debugging
    // a blank preview can find the cause.
    if (project.format === 'nextjs') {
        await refreshLayoutTemplateIfNeeded(args.folderPath).catch(() => undefined);
        // Ensure the `@/*` path alias exists so component imports resolve
        // under `next dev`. Repairs projects scaffolded before tsconfig.json
        // was written, and the bare tsconfig `next dev` auto-creates.
        await ensureTsConfigIfNeeded(args.folderPath).catch(() => undefined);
    }
    // Backfill Scamp's project-default theme rules (--font-sans token,
    // box-sizing reset, body font-family) into theme.css if any are
    // missing. Strictly additive — projects that already declare these
    // are a no-op. Carries projects scaffolded before these defaults
    // landed forward without an explicit user action.
    await ensureThemeDefaultsIfNeeded(args.folderPath, project.format).catch(() => undefined);
    // Refresh `agent.md` to the latest template. The file is fully
    // Scamp-managed (a banner at the top of the template flags this);
    // refreshing on open guarantees every new Scamp release ships
    // updated agent guidance without the user having to think about it.
    await refreshAgentMdIfNeeded(args.folderPath, project.format).catch(() => undefined);
    await addRecentProject({
        name: project.name,
        path: project.path,
        format: project.format,
    });
    await watchProject(args.folderPath);
    setSentryProjectRoot(args.folderPath);
    await startMcpForProject(args.folderPath);
    await setActiveImportProject(args.folderPath);
    return project;
};
const migrateProject = async (args) => {
    // Re-detect to defend against a stale cache (a user may have hand-
    // converted the project on disk between open and migrate).
    const format = await detectProjectFormat(args.projectPath);
    if (format === 'scamp') {
        throw new Error('This project is already in Scamp format.');
    }
    // Each format migrates one step: legacy → nextjs, nextjs → scamp.
    const target = format === 'legacy' ? 'nextjs' : 'scamp';
    const result = format === 'legacy'
        ? await migrateLegacyToNextjs(args.projectPath)
        : await migrateNextjsToScamp(args.projectPath, SCAFFOLDED_SCAMPJS_RANGE);
    setCachedProjectFormat(args.projectPath, target);
    await updateRecentProjectFormat(args.projectPath, target);
    // Re-read so the renderer gets the post-migration project data
    // (new page paths, new format, etc.) without a full close/reopen.
    const project = await readProject(args.projectPath);
    return { project, backupPath: result.backupPath, unmovedFiles: result.unmovedFiles };
};
export const registerProjectIpc = () => {
    ipcMain.handle(IPC.ProjectChooseFolder, () => chooseFolder());
    ipcMain.handle(IPC.ProjectCreate, (_e, args) => createProject(args));
    ipcMain.handle(IPC.ProjectOpen, (_e, args) => openProject(args));
    ipcMain.handle(IPC.ProjectRead, (_e, args) => {
        assertInsideActiveProject(args.folderPath);
        return readProject(args.folderPath);
    });
    ipcMain.handle(IPC.ProjectMigrate, (_e, args) => {
        assertInsideActiveProject(args.projectPath);
        return migrateProject(args);
    });
};
