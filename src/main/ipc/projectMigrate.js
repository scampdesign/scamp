import { promises as fs } from 'fs';
import { randomBytes } from 'crypto';
import { basename, dirname, join } from 'path';
import { projectTemplate } from 'scampjs/templates';
import { errorMessage } from '@shared/errorMessage';
import { AGENT_MD_CONTENT, CLAUDE_MD_CONTENT, DEFAULT_NEXT_CONFIG_TS, DEFAULT_THEME_CSS, defaultLayoutTsx, defaultPackageJson, } from '@shared/agentMd';
import { readProjectLegacy, readProjectNextjs } from './projectScaffold';
import { parseViewWrapper } from '@shared/templates';
import { DEFAULT_TSCONFIG_JSON } from '@shared/tsconfigAlias';
/**
 * Anything in the legacy project root that the migrator knows how to
 * place into the new layout. Files matching these names are MOVED;
 * unrecognised root-level files (e.g. README, agent leftovers) are
 * left in place — flagged in `unmovedFiles` for the UI to surface.
 */
const RECOGNISED_ROOT_FILES = new Set([
    'agent.md',
    'CLAUDE.md',
    'theme.css',
    'scamp.config.json',
    '.gitignore',
]);
/**
 * Rewrite asset references from the legacy `./assets/...` form to the
 * Next.js absolute server-root form `/assets/...`. Limited to the two
 * contexts where asset paths actually live so we don't accidentally
 * mangle a string literal that happens to contain `./assets/`:
 *
 *   - CSS `url(...)` declarations
 *   - JSX `src="..."` / `srcSet="..."` attribute values
 */
export const rewriteAssetReferences = (text) => {
    let out = text;
    // CSS url("./assets/foo.png") / url('./assets/foo.png') / url(./assets/foo.png)
    out = out.replace(/url\(\s*(["']?)\.\/assets\//g, (_match, quote) => `url(${quote}/assets/`);
    // JSX src="./assets/foo.png" / src='./assets/foo.png'
    out = out.replace(/(src|srcSet)\s*=\s*(["'])\.\/assets\//g, (_match, attr, quote) => `${attr}=${quote}/assets/`);
    return out;
};
/**
 * Rewrite a page's TSX so it imports `./page.module.css` and continues
 * to compile. The legacy generator imported `./<pageName>.module.css`;
 * the nextjs generator always imports the co-located `./page.module.css`.
 */
const rewriteImportLine = (tsx, oldPageName) => {
    const importRe = new RegExp(`(import\\s+styles\\s+from\\s+['"]\\.\\/)${oldPageName.replace(/-/g, '\\-')}(\\.module\\.css['"];?)`);
    return tsx.replace(importRe, `$1page$2`);
};
/**
 * Best-effort cleanup helper. Recursively delete a path; never throw.
 */
const safeRm = async (p) => {
    try {
        await fs.rm(p, { recursive: true, force: true });
    }
    catch {
        // Nothing to do — the migrator is best-effort about cleanup.
    }
};
/**
 * Stage a Next.js-format project tree inside `stageDir`, derived from
 * the legacy project at `legacyDir`. The stage dir is sibling to the
 * project so move-renames inside it are atomic on the same filesystem.
 *
 * Skips the destructive bit — the caller swaps stage in once staging
 * succeeds.
 */
const stageNextjsTree = async (legacyDir, stageDir, projectName, pages) => {
    await fs.mkdir(stageDir, { recursive: false });
    // app/ structure
    const appDir = join(stageDir, 'app');
    await fs.mkdir(appDir);
    await fs.writeFile(join(appDir, 'layout.tsx'), defaultLayoutTsx(projectName), 'utf-8');
    // theme.css moves into app/ so it can be imported from layout.tsx.
    const legacyThemePath = join(legacyDir, 'theme.css');
    let themeContent = DEFAULT_THEME_CSS;
    try {
        themeContent = await fs.readFile(legacyThemePath, 'utf-8');
    }
    catch {
        // Old project predates theme.css — fall back to defaults.
    }
    await fs.writeFile(join(appDir, 'theme.css'), themeContent, 'utf-8');
    // Pages
    for (const page of pages) {
        const isHome = page.name === 'home';
        const pageRoot = isHome ? appDir : join(appDir, page.name);
        if (!isHome) {
            await fs.mkdir(pageRoot);
        }
        const tsx = rewriteAssetReferences(rewriteImportLine(page.tsxContent, page.name));
        const css = rewriteAssetReferences(page.cssContent);
        await fs.writeFile(join(pageRoot, 'page.tsx'), tsx, 'utf-8');
        await fs.writeFile(join(pageRoot, 'page.module.css'), css, 'utf-8');
    }
    // Project root infrastructure files
    await fs.writeFile(join(stageDir, 'agent.md'), AGENT_MD_CONTENT, 'utf-8');
    await fs.writeFile(join(stageDir, 'CLAUDE.md'), CLAUDE_MD_CONTENT, 'utf-8');
    await fs.writeFile(join(stageDir, 'package.json'), defaultPackageJson(projectName), 'utf-8');
    await fs.writeFile(join(stageDir, 'next.config.ts'), DEFAULT_NEXT_CONFIG_TS, 'utf-8');
    // public/assets — copy over any legacy assets/ contents.
    const publicAssetsDir = join(stageDir, 'public', 'assets');
    await fs.mkdir(publicAssetsDir, { recursive: true });
    const legacyAssetsDir = join(legacyDir, 'assets');
    try {
        const entries = await fs.readdir(legacyAssetsDir);
        for (const entry of entries) {
            // Plain copy — supports nested folders inside assets/.
            await fs.cp(join(legacyAssetsDir, entry), join(publicAssetsDir, entry), { recursive: true });
        }
    }
    catch {
        // No legacy assets/ folder — nothing to migrate.
    }
};
/**
 * Atomic-ish legacy → nextjs migration.
 *
 * Strategy:
 *   1. Read all legacy pages into memory.
 *   2. Stage the nextjs tree in a sibling `.scamp-stage-<id>/` dir.
 *      Any failure here is recoverable: we delete the stage and the
 *      original project is untouched.
 *   3. Move all known legacy artefacts into a sibling
 *      `.scamp-backup-<timestamp>/` dir. We keep this around so the
 *      user has a recovery path.
 *   4. Move the stage's contents into the project root.
 *
 * Step 4 is the only window where the project is in a partial state
 * on disk. Each individual `fs.rename` is atomic on a single
 * filesystem; the multi-step swap isn't, but the backup directory is
 * the recovery path. We surface its location to the user.
 */
export const migrateLegacyToNextjs = async (projectPath) => {
    const projectName = basename(projectPath);
    // 1. Read the legacy project.
    const pages = await readProjectLegacy(projectPath);
    if (pages.length === 0) {
        throw new Error('No pages found in this project — nothing to migrate. Open the project, add a page, and try again.');
    }
    // 2. Stage the nextjs tree.
    const stageDir = join(projectPath, `.scamp-stage-${randomBytes(4).toString('hex')}`);
    try {
        await stageNextjsTree(projectPath, stageDir, projectName, pages);
    }
    catch (err) {
        await safeRm(stageDir);
        throw err;
    }
    const isLegacyArtefact = (entry) => entry.endsWith('.tsx') || entry.endsWith('.module.css') || entry === 'assets' || RECOGNISED_ROOT_FILES.has(entry);
    const legacyClashes = await rootClashes(projectPath, stageDir, isLegacyArtefact).catch(async (err) => {
        await safeRm(stageDir);
        throw err;
    });
    if (legacyClashes.length > 0) {
        await safeRm(stageDir);
        throw clashError(legacyClashes);
    }
    // 3. Move the legacy artefacts into a backup directory.
    const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d+Z$/, 'Z');
    const backupDir = join(projectPath, `.scamp-backup-${timestamp}`);
    await fs.mkdir(backupDir, { recursive: false });
    const unmovedFiles = [];
    let entries;
    try {
        entries = await fs.readdir(projectPath);
    }
    catch (err) {
        await safeRm(stageDir);
        await safeRm(backupDir);
        throw err;
    }
    try {
        for (const entry of entries) {
            // Skip the stage dir and the backup dir we just created — they
            // aren't legacy artefacts.
            if (entry.startsWith('.scamp-stage-'))
                continue;
            if (entry.startsWith('.scamp-backup-'))
                continue;
            const fullPath = join(projectPath, entry);
            if (isLegacyArtefact(entry)) {
                await fs.rename(fullPath, join(backupDir, entry));
            }
            else {
                // Unknown file at the project root — leave it. Surface it so
                // the UI can warn the user.
                unmovedFiles.push(entry);
            }
        }
    }
    catch (err) {
        // Try to roll back: move anything already in the backup dir back
        // into place. Best-effort; if this fails the user has their files
        // safe in the backup dir either way.
        try {
            const backedUp = await fs.readdir(backupDir);
            for (const entry of backedUp) {
                await fs
                    .rename(join(backupDir, entry), join(projectPath, entry))
                    .catch(() => undefined);
            }
            await safeRm(backupDir);
        }
        catch {
            // Give up — the user has the backup dir.
        }
        await safeRm(stageDir);
        throw err;
    }
    // 4. Move staged contents into the project root.
    try {
        const staged = await fs.readdir(stageDir);
        for (const entry of staged) {
            await fs.rename(join(stageDir, entry), join(projectPath, entry));
        }
        await fs.rmdir(stageDir);
    }
    catch (err) {
        // Mid-swap failure. The user's files are safe in the backup dir.
        // Surface a clear error pointing at it.
        throw new Error(`Migration failed mid-swap. Your original project files are at ${backupDir}. Move them back into ${projectPath} and try again. (${errorMessage(err)})`);
    }
    return { backupPath: backupDir, unmovedFiles };
};
/**
 * nextjs → scamp: the pages become views and routes, the theme and
 * DESIGN.md move under design/, package.json swaps Next and React for
 * scampjs and Preact, and the Next-only files go to the backup.
 * Views, components, public/, .scamp/, and the agent files stay where
 * they are. Every page must already be a view (its app/ file a one-line
 * wrapper); the renderer converts plain pages first, since that needs
 * the parser and generator. see docs/notes/nextjs-sunset.md
 */
const BODY_RULES = `body {
  margin: 0;
  min-height: 100vh;
}
`;
const routeTsx = (viewName) => `import ${viewName} from '@/views/${viewName}/${viewName}';

export const render = 'static';

export default function ${viewName}Route() {
  return <${viewName} />;
}
`;
const exists = async (file) => {
    try {
        await fs.access(file);
        return true;
    }
    catch {
        return false;
    }
};
/**
 * Staged names already at the project root that the backup step leaves in
 * place: the user's own. The swap would overwrite them (a file) or fail
 * halfway (a folder), so the migration refuses before moving anything.
 */
const rootClashes = async (projectPath, stageDir, backedUp) => {
    const clashes = [];
    for (const entry of await fs.readdir(stageDir)) {
        if (!backedUp(entry) && (await exists(join(projectPath, entry))))
            clashes.push(entry);
    }
    return clashes;
};
const clashError = (clashes) => new Error(`Move or rename ${clashes.join(', ')} at the top of the project first: the migration would replace ${clashes.length === 1 ? 'it' : 'them'}.`);
/** Every `app/<slug>/page.tsx` that is a view wrapper, home first. */
const readWrappers = async (projectPath) => {
    const appDir = join(projectPath, 'app');
    const wrappers = [];
    const consider = async (slug, dir) => {
        const file = join(dir, 'page.tsx');
        if (!(await exists(file)))
            return;
        const viewName = parseViewWrapper(await fs.readFile(file, 'utf-8'));
        if (viewName !== null)
            wrappers.push({ slug, viewName, dir });
    };
    await consider('home', appDir);
    let entries = [];
    try {
        entries = await fs.readdir(appDir, { withFileTypes: true });
    }
    catch {
        return wrappers;
    }
    for (const entry of entries) {
        if (entry.isDirectory())
            await consider(entry.name, join(appDir, entry.name));
    }
    return wrappers;
};
/** Swap the Next.js stack for the framework's; keep everything else. */
export const rewritePackageJsonForScamp = (original, projectName, scampjsRange) => {
    let parsed = {};
    try {
        const value = JSON.parse(original);
        if (typeof value === 'object' && value !== null)
            parsed = value;
    }
    catch {
        // A malformed package.json is replaced outright.
    }
    const record = (value) => typeof value === 'object' && value !== null
        ? Object.fromEntries(Object.entries(value).filter((entry) => typeof entry[1] === 'string'))
        : {};
    const dropped = new Set(['next', 'react', 'react-dom', '@types/react', '@types/react-dom']);
    const keep = (deps) => Object.fromEntries(Object.entries(deps).filter(([name]) => !dropped.has(name)));
    const scripts = record(parsed['scripts']);
    for (const [name, command] of Object.entries(scripts)) {
        if (/^next(\s|$)/.test(command))
            delete scripts[name];
    }
    const devDependencies = keep(record(parsed['devDependencies']));
    const out = {
        ...parsed,
        name: typeof parsed['name'] === 'string' ? parsed['name'] : projectName,
        private: true,
        type: 'module',
        scripts: { dev: 'scamp dev', build: 'scamp build', preview: 'scamp preview', ...scripts },
        dependencies: {
            preact: '^10.29.0',
            scampjs: scampjsRange,
            ...keep(record(parsed['dependencies'])),
        },
        ...(Object.keys(devDependencies).length > 0 ? { devDependencies } : {}),
    };
    if (Object.keys(devDependencies).length === 0)
        delete out['devDependencies'];
    return `${JSON.stringify(out, null, 2)}\n`;
};
export const migrateNextjsToScamp = async (projectPath, scampjsRange) => {
    const projectName = basename(projectPath);
    // 1. Every page must already be a view; the renderer converts the
    //    rest before calling. Refuse rather than guess.
    const plainPages = await readProjectNextjs(projectPath);
    if (plainPages.length > 0) {
        throw new Error(`Convert these pages to views first: ${plainPages.map((p) => p.name).join(', ')}.`);
    }
    const wrappers = await readWrappers(projectPath);
    // 2. Stage the new files.
    const stageDir = join(projectPath, `.scamp-stage-${randomBytes(4).toString('hex')}`);
    const template = projectTemplate({ name: projectName, scampjsVersion: scampjsRange });
    try {
        await fs.mkdir(join(stageDir, 'routes'), { recursive: true });
        await fs.mkdir(join(stageDir, 'design'), { recursive: true });
        for (const w of wrappers) {
            const file = w.slug === 'home' ? 'index.tsx' : `${w.slug}.tsx`;
            await fs.writeFile(join(stageDir, 'routes', file), routeTsx(w.viewName), 'utf-8');
        }
        const themePath = join(projectPath, 'app', 'theme.css');
        let theme = (await exists(themePath)) ? await fs.readFile(themePath, 'utf-8') : DEFAULT_THEME_CSS;
        // The Next.js layout set the body margin inline; the framework's
        // shell leaves body rules to the theme.
        if (!/body\s*\{[^}]*margin\s*:\s*0/.test(theme))
            theme = `${theme.replace(/\s*$/, '\n')}\n${BODY_RULES}`;
        await fs.writeFile(join(stageDir, 'design', 'theme.css'), theme, 'utf-8');
        const designMd = join(projectPath, 'DESIGN.md');
        if (await exists(designMd)) {
            await fs.copyFile(designMd, join(stageDir, 'design', 'DESIGN.md'));
        }
        const pkgPath = join(projectPath, 'package.json');
        const pkg = (await exists(pkgPath)) ? await fs.readFile(pkgPath, 'utf-8') : '{}';
        await fs.writeFile(join(stageDir, 'package.json'), rewritePackageJsonForScamp(pkg, projectName, scampjsRange), 'utf-8');
        await fs.writeFile(join(stageDir, 'scamp-env.d.ts'), template['scamp-env.d.ts'] ?? '', 'utf-8');
        await fs.writeFile(join(stageDir, 'tsconfig.json'), template['tsconfig.json'] ?? '', 'utf-8');
    }
    catch (err) {
        await safeRm(stageDir);
        throw err;
    }
    // package.json goes to the backup and a customised tsconfig.json is kept, so neither clashes.
    const scampClashes = await rootClashes(projectPath, stageDir, (e) => e === 'package.json' || e === 'tsconfig.json').catch(async (err) => {
        await safeRm(stageDir);
        throw err;
    });
    if (scampClashes.length > 0) {
        await safeRm(stageDir);
        throw clashError(scampClashes);
    }
    // 3. Move the Next.js files into the backup, keeping their paths.
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const backupDir = join(projectPath, `.scamp-backup-${timestamp}`);
    await fs.mkdir(backupDir, { recursive: false });
    const moved = [];
    const moveToBackup = async (relative) => {
        const from = join(projectPath, relative);
        if (!(await exists(from)))
            return;
        const to = join(backupDir, relative);
        await fs.mkdir(dirname(to), { recursive: true });
        await fs.rename(from, to);
        moved.push(relative);
    };
    const tsconfigPath = join(projectPath, 'tsconfig.json');
    const tsconfigIsOurs = !(await exists(tsconfigPath)) || (await fs.readFile(tsconfigPath, 'utf-8')) === DEFAULT_TSCONFIG_JSON;
    try {
        for (const w of wrappers) {
            const dir = w.slug === 'home' ? 'app' : join('app', w.slug);
            await moveToBackup(join(dir, 'page.tsx'));
            await moveToBackup(join(dir, 'page.module.css'));
        }
        for (const relative of ['app/layout.tsx', 'app/theme.css', 'next.config.ts', 'next.config.js', 'next-env.d.ts', 'package.json', 'DESIGN.md', '.next', 'node_modules']) {
            await moveToBackup(relative);
        }
        if (tsconfigIsOurs)
            await moveToBackup('tsconfig.json');
    }
    catch (err) {
        for (const relative of moved.reverse()) {
            await fs.rename(join(backupDir, relative), join(projectPath, relative)).catch(() => undefined);
        }
        await safeRm(backupDir);
        await safeRm(stageDir);
        throw err;
    }
    // 4. Move the staged files into place. tsconfig.json is replaced only
    //    when it was still the app's own; a customised one is kept and
    //    reported, since its `react` path mapping needs a hand edit.
    const unmovedFiles = [];
    try {
        for (const entry of await fs.readdir(stageDir)) {
            if (entry === 'tsconfig.json' && !tsconfigIsOurs) {
                unmovedFiles.push('tsconfig.json (kept: map react and react-dom to preact/compat)');
                continue;
            }
            await fs.rename(join(stageDir, entry), join(projectPath, entry));
        }
        // A kept tsconfig.json leaves its staged copy behind.
        await safeRm(stageDir);
    }
    catch (err) {
        throw new Error(`Migration failed mid-swap. Your original project files are at ${backupDir}. Move them back into ${projectPath} and try again. (${errorMessage(err)})`);
    }
    // 5. Whatever is left under app/ (API routes, hand-written pages) and
    //    a features/ folder are the user's; list them.
    const leftovers = async (dir, prefix) => {
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const relative = `${prefix}${entry.name}`;
            if (entry.isDirectory())
                await leftovers(join(dir, entry.name), `${relative}/`);
            else
                unmovedFiles.push(relative);
        }
    };
    await leftovers(join(projectPath, 'app'), 'app/');
    await pruneEmptyDirs(join(projectPath, 'app'));
    if (await exists(join(projectPath, 'features')))
        unmovedFiles.push('features/');
    return { backupPath: backupDir, unmovedFiles };
};
/** Remove `dir` and its empty subfolders, bottom up; leave anything with files. */
const pruneEmptyDirs = async (dir) => {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    }
    catch {
        return true;
    }
    let empty = true;
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (!(await pruneEmptyDirs(join(dir, entry.name))))
                empty = false;
        }
        else {
            empty = false;
        }
    }
    if (empty)
        await fs.rmdir(dir).catch(() => undefined);
    return empty;
};
