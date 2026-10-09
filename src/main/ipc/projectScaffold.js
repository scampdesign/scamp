import { promises as fs } from 'fs';
import { basename, dirname, join } from 'path';
import { projectTemplate } from 'scampjs/templates';
import { version as scampjsVersion } from 'scampjs/package.json';
/** The `scampjs` range new projects pin: the version this build was tested with. */
export const SCAFFOLDED_SCAMPJS_RANGE = `^${scampjsVersion}`;
import { parseViewWrapper, AGENT_MD_CONTENT_SCAMP, withRecipeSections, } from '@shared/templates';
import { AGENT_MD_CONTENT, AGENT_MD_CONTENT_LEGACY, CLAUDE_MD_CONTENT, DEFAULT_NEXT_CONFIG_TS, DEFAULT_PAGE_CSS, DEFAULT_THEME_CSS, defaultLayoutTsx, defaultPackageJson, defaultPageTsx, } from '@shared/agentMd';
import { decideLayoutMigration } from '@shared/layoutMigration';
import { backfillThemeDefaults } from '@shared/themeBackfill';
import { DEFAULT_TSCONFIG_JSON, ensureTsconfigAlias } from '@shared/tsconfigAlias';
const componentNameFromPage = (pageName) => pageName
    .split(/[-_]/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
/**
 * Path on disk where a project's `theme.css` lives. Nextjs projects
 * co-locate it inside `app/` so the root layout can import it and
 * `next dev` picks up the tokens; legacy keeps it at the project root.
 */
export const themePathFor = (projectPath, format) => format === 'nextjs'
    ? join(projectPath, 'app', 'theme.css')
    : format === 'scamp'
        ? join(projectPath, 'design', 'theme.css')
        : join(projectPath, 'theme.css');
/**
 * Read a single page (TSX + CSS pair) from disk, returning null when
 * the pair is incomplete (one half missing) so callers can skip it
 * without crashing the project open.
 */
const readPage = async (name, tsxPath, cssPath) => {
    try {
        const [tsxContent, cssContent] = await Promise.all([
            fs.readFile(tsxPath, 'utf-8'),
            fs.readFile(cssPath, 'utf-8'),
        ]);
        return { name, tsxPath, cssPath, tsxContent, cssContent };
    }
    catch {
        return null;
    }
};
/**
 * Read one component's TSX + CSS module pair into memory.
 * Returns null when the pair is incomplete (one half missing) so
 * callers can skip the broken component without crashing the
 * project open. Same shape as `readPage`.
 */
const readComponent = async (name, tsxPath, cssPath) => {
    try {
        const [tsxContent, cssContent] = await Promise.all([
            fs.readFile(tsxPath, 'utf-8'),
            fs.readFile(cssPath, 'utf-8'),
        ]);
        return { name, tsxPath, cssPath, tsxContent, cssContent };
    }
    catch {
        return null;
    }
};
/**
 * Scan a Next.js project's `components/` folder for reusable
 * component definitions. Each component is one folder under
 * `components/` containing `<Name>.tsx` + `<Name>.module.css`.
 * Folders missing either half are skipped silently — same
 * defensive read pattern as `readProjectNextjs` for pages.
 *
 * Legacy-format projects don't have components — callers should
 * skip this and return `[]` instead.
 */
export const readProjectComponents = async (folderPath, kind = 'component') => {
    const componentsDir = join(folderPath, kind === 'view' ? 'views' : 'components');
    let entries = [];
    try {
        entries = await fs.readdir(componentsDir, { withFileTypes: true });
    }
    catch {
        // `components/` folder doesn't exist — fresh project that
        // hasn't created any components yet, or a project from before
        // this feature shipped. Both fine; return empty.
        return [];
    }
    const components = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const name = entry.name;
        const component = await readComponent(name, join(componentsDir, name, `${name}.tsx`), join(componentsDir, name, `${name}.module.css`));
        if (component)
            components.push({ ...component, kind });
    }
    return components;
};
/**
 * Components and views as one list. The two share a namespace (the
 * store, thumbnails, and props types key by name), so a view whose
 * name a component already uses is skipped rather than shadowing it.
 */
export const readProjectComponentsAndViews = async (folderPath) => {
    const [components, views] = await Promise.all([
        readProjectComponents(folderPath, 'component'),
        readProjectComponents(folderPath, 'view'),
    ]);
    const taken = new Set(components.map((c) => c.name));
    return [...components, ...views.filter((v) => !taken.has(v.name))];
};
export const readProjectLegacy = async (folderPath) => {
    const entries = await fs.readdir(folderPath);
    const tsxFiles = entries.filter((f) => f.endsWith('.tsx'));
    const pages = [];
    for (const tsxFile of tsxFiles) {
        const baseName = tsxFile.replace(/\.tsx$/, '');
        const cssFile = `${baseName}.module.css`;
        if (!entries.includes(cssFile))
            continue;
        const page = await readPage(baseName, join(folderPath, tsxFile), join(folderPath, cssFile));
        if (page)
            pages.push(page);
    }
    return pages;
};
/**
 * Read pages from a Next.js App Router project layout. The root page
 * lives at `app/page.tsx` and is keyed as `'home'` internally so the
 * rest of the app (sidebar labelling, component-name derivation, page
 * switching) works without special-casing. Additional pages live in
 * folders inside `app/` — e.g. `app/about/page.tsx` is keyed `'about'`.
 */
export const readProjectNextjs = async (folderPath) => {
    const appDir = join(folderPath, 'app');
    const pages = [];
    // Root / home page
    const homePage = await readPage('home', join(appDir, 'page.tsx'), join(appDir, 'page.module.css'));
    if (homePage && !isViewWrapper(homePage))
        pages.push(homePage);
    // Nested page folders
    let entries = [];
    try {
        entries = await fs.readdir(appDir, { withFileTypes: true });
    }
    catch {
        return pages;
    }
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const page = await readPage(entry.name, join(appDir, entry.name, 'page.tsx'), join(appDir, entry.name, 'page.module.css'));
        if (page && !isViewWrapper(page))
            pages.push(page);
    }
    return pages;
};
// A view's wrapper page normally has no CSS module and so never reads
// as a page; a stray one left beside it must not surface either.
const isViewWrapper = (page) => parseViewWrapper(page.tsxContent) !== null;
// see docs/notes/components-thumbnails.md — `.scamp/` excluded.
const NEXTJS_GITIGNORE = `# Dependencies
node_modules

# Next.js build output
.next
.swc
out

# Environment variables
.env*.local

# Scamp local state (component thumbnails, snapshots, etc.), except the
# Scamp Agent's conversations, which are shared with the project
.scamp/*
!.scamp/agent-history/

# Scamp MCP server registration (machine-local — do not commit)
.mcp.json
`;
const LEGACY_GITIGNORE = `# Dependencies
node_modules

# Environment variables
.env*.local

# Scamp local state (component thumbnails, snapshots, etc.), except the
# Scamp Agent's conversations, which are shared with the project
.scamp/*
!.scamp/agent-history/

# Scamp MCP server registration (machine-local — do not commit)
.mcp.json
`;
/**
 * A `.gitignore` that ignores `.scamp` whole, rewritten to keep
 * `.scamp/agent-history/` — git can't re-include a file inside an
 * ignored folder, so the folder becomes `.scamp/*`.
 */
export const shareAgentHistory = (gitignore) => gitignore.replace(/^\/?\.scamp\/?[ \t]*$/m, '.scamp/*\n!.scamp/agent-history/');
/** Write `.gitignore` only when missing — don't clobber user customisations. */
const writeGitignoreIfMissing = async (projectPath, content) => {
    const target = join(projectPath, '.gitignore');
    try {
        await fs.access(target);
        return;
    }
    catch {
        // Fall through to write.
    }
    await fs.writeFile(target, content, 'utf-8');
};
/**
 * Write the Next.js App Router scaffold into a freshly-created
 * project folder. Creates `app/` (with the home page, layout, and
 * `theme.css` co-located so `next dev` picks up the tokens),
 * `public/assets/`, and the auto-generated `package.json` /
 * `next.config.ts` at the project root.
 *
 * Caller is responsible for creating the project directory itself
 * and for writing `scamp.config.json` (via `ensureProjectConfig`).
 */
export const scaffoldNextjsProject = async (projectPath, projectName) => {
    await fs.writeFile(join(projectPath, 'agent.md'), AGENT_MD_CONTENT, 'utf-8');
    await fs.writeFile(join(projectPath, 'CLAUDE.md'), CLAUDE_MD_CONTENT, 'utf-8');
    await fs.writeFile(join(projectPath, 'package.json'), defaultPackageJson(projectName), 'utf-8');
    await fs.writeFile(join(projectPath, 'next.config.ts'), DEFAULT_NEXT_CONFIG_TS, 'utf-8');
    // tsconfig.json carries the `@/*` path alias that page/component
    // imports rely on; without it `next dev` can't resolve
    // `@/components/...`. See docs/notes/tsconfig-alias.md.
    await fs.writeFile(join(projectPath, 'tsconfig.json'), DEFAULT_TSCONFIG_JSON, 'utf-8');
    const appDir = join(projectPath, 'app');
    await fs.mkdir(appDir, { recursive: false });
    await fs.writeFile(join(appDir, 'layout.tsx'), defaultLayoutTsx(projectName), 'utf-8');
    await fs.writeFile(join(appDir, 'theme.css'), DEFAULT_THEME_CSS, 'utf-8');
    const componentName = componentNameFromPage('home');
    await fs.writeFile(join(appDir, 'page.tsx'), defaultPageTsx(componentName, 'home', 'page'), 'utf-8');
    await fs.writeFile(join(appDir, 'page.module.css'), DEFAULT_PAGE_CSS, 'utf-8');
    await fs.mkdir(join(projectPath, 'public', 'assets'), { recursive: true });
    await writeGitignoreIfMissing(projectPath, NEXTJS_GITIGNORE);
};
/**
 * Refresh `app/layout.tsx` if it byte-matches a known legacy template.
 * Called on project open so old projects pick up the body reset
 * (`margin: 0; min-height: 100vh`) without a manual edit. User-
 * customised layouts are left alone — `decideLayoutMigration` returns
 * `'warn'` and we surface a one-line hint via the main-process console
 * so users hitting "preview is blank" can find the cause.
 *
 * Idempotent: subsequent calls with the latest template are a no-op
 * (no log spam on repeat opens).
 */
export const refreshLayoutTemplateIfNeeded = async (projectPath) => {
    const layoutPath = join(projectPath, 'app', 'layout.tsx');
    let current;
    try {
        current = await fs.readFile(layoutPath, 'utf-8');
    }
    catch {
        // No layout.tsx — caller is opening a non-nextjs project or a
        // project with a missing scaffold. Nothing to migrate.
        return;
    }
    const projectName = basename(projectPath);
    const action = decideLayoutMigration(current, projectName);
    if (action.kind === 'noop')
        return;
    if (action.kind === 'replace') {
        await fs.writeFile(layoutPath, action.next, 'utf-8');
        return;
    }
    // 'warn' — log a one-line hint. Doesn't surface a UI banner; the
    // hint is for users debugging a blank-preview issue.
    console.warn(`[layout-migration] ${layoutPath}: ${action.reason}`);
};
/**
 * Refresh \`agent.md\` AND its Claude Code loader \`CLAUDE.md\` to the
 * latest Scamp-shipped templates whenever the on-disk content
 * differs. Both files are fully Scamp-managed — \`agent.md\` is the
 * canonical agent instructions, \`CLAUDE.md\` is a tiny stub that
 * uses Claude Code's \`@./agent.md\` import syntax so sessions
 * auto-load the guidance on start. The managed-file marker at the
 * top of each template flags that hand-edits won't survive.
 *
 * Refreshing on open means new Scamp releases ship updated agent
 * guidance to every project on the next open without the user
 * having to think about it.
 *
 * Missing file → write it. Content matches latest → no-op. Anything
 * else → overwrite. The compare-first check skips the chokidar
 * event when there's no actual change.
 */
export const refreshAgentMdIfNeeded = async (projectPath, format) => {
    const agentPath = join(projectPath, 'agent.md');
    // A framework project's agent.md may carry sections a recipe appended
    // (the Database section from `scamp add drizzle`); the app's template
    // is regenerated around them. see docs/notes/routes-in-the-app.md
    const agentTarget = format === 'nextjs'
        ? AGENT_MD_CONTENT
        : format === 'scamp'
            ? withRecipeSections(AGENT_MD_CONTENT_SCAMP, await fs.readFile(agentPath, 'utf-8').catch(() => null))
            : AGENT_MD_CONTENT_LEGACY;
    await refreshManagedFile(agentPath, agentTarget);
    await refreshManagedFile(join(projectPath, 'CLAUDE.md'), CLAUDE_MD_CONTENT);
};
const refreshManagedFile = async (path, target) => {
    try {
        const existing = await fs.readFile(path, 'utf-8');
        if (existing === target)
            return;
    }
    catch {
        // File missing — fall through and write the template.
    }
    await fs.writeFile(path, target, 'utf-8');
};
/**
 * Additively add Scamp's project-default theme rules to the project's
 * `theme.css` if missing — the `--font-sans` token, the universal
 * `box-sizing: border-box` reset, and the body-level font-family
 * rule. Used to carry projects scaffolded before these defaults
 * landed in `DEFAULT_THEME_CSS` forward without trampling user edits.
 *
 * Idempotent: running this on a project that already has all three
 * rules is a no-op. Strictly additive — never replaces or removes
 * existing declarations.
 */
export const ensureThemeDefaultsIfNeeded = async (projectPath, format) => {
    const themePath = themePathFor(projectPath, format);
    let current;
    try {
        current = await fs.readFile(themePath, 'utf-8');
    }
    catch {
        // No theme.css — caller's project setup is incomplete; the
        // upstream `openProject` flow seeds a default theme.css when
        // missing, so this only fires in edge cases we don't need to
        // handle here.
        return;
    }
    const result = backfillThemeDefaults(current);
    if (!result.changed)
        return;
    await fs.writeFile(themePath, result.content, 'utf-8');
};
/**
 * Ensure the project's `tsconfig.json` declares the `@/*` path alias
 * so `next dev` can resolve `@/components/...` imports. Writes a fresh
 * template when the file is missing, and injects the alias into an
 * existing config that lacks it (e.g. the bare tsconfig `next dev`
 * auto-creates on first run). Already-aliased and user-customised
 * configs are left untouched. See docs/notes/tsconfig-alias.md.
 */
export const ensureTsConfigIfNeeded = async (projectPath) => {
    const tsconfigPath = join(projectPath, 'tsconfig.json');
    let current;
    try {
        current = await fs.readFile(tsconfigPath, 'utf-8');
    }
    catch {
        current = null;
    }
    const next = ensureTsconfigAlias(current);
    if (next === null) {
        // No change needed, OR the file exists but is unparseable (JSONC
        // with comments) so we won't risk a lossy rewrite. Warn in the
        // latter case so a user hitting the module-not-found error can add
        // the `@/*` alias by hand.
        if (current !== null && current.trim() !== '') {
            try {
                JSON.parse(current);
            }
            catch {
                console.warn(`[tsconfig-alias] ${tsconfigPath} is not plain JSON; add ` +
                    `compilerOptions.paths["@/*"] = ["./*"] manually so @/ imports resolve.`);
            }
        }
        return;
    }
    await fs.writeFile(tsconfigPath, next, 'utf-8');
};
/**
 * Legacy flat-layout scaffold. Kept around for the migrator's
 * fixture-creation tests and for parity in the shared scaffold module.
 */
export const scaffoldLegacyProject = async (projectPath) => {
    await fs.writeFile(join(projectPath, 'agent.md'), AGENT_MD_CONTENT_LEGACY, 'utf-8');
    await fs.writeFile(join(projectPath, 'CLAUDE.md'), CLAUDE_MD_CONTENT, 'utf-8');
    const componentName = componentNameFromPage('home');
    await fs.writeFile(join(projectPath, 'home.tsx'), defaultPageTsx(componentName, 'home'), 'utf-8');
    await fs.writeFile(join(projectPath, 'home.module.css'), DEFAULT_PAGE_CSS, 'utf-8');
    await fs.writeFile(join(projectPath, 'theme.css'), DEFAULT_THEME_CSS, 'utf-8');
    await writeGitignoreIfMissing(projectPath, LEGACY_GITIGNORE);
};
/**
 * Scaffold a Scamp-framework project from `scampjs/templates`, so the
 * app and `create-scampjs` write identical files. The templates are
 * bundled into the main process (the package is a devDependency; only
 * this subpath is imported), and the scaffold pins the `scampjs`
 * version the app was built against, which is the version its
 * supported contract range was tested with. see docs/notes/nextjs-sunset.md
 */
export const scaffoldScampProject = async (projectPath, name) => {
    const files = projectTemplate({ name, scampjsVersion: SCAFFOLDED_SCAMPJS_RANGE });
    for (const [relative, content] of Object.entries(files)) {
        const absolute = join(projectPath, relative);
        await fs.mkdir(dirname(absolute), { recursive: true });
        await fs.writeFile(absolute, content, 'utf-8');
    }
    // The template's agent.md is a stub for projects made outside Scamp;
    // the app writes its full instructions, as it does on every open.
    await fs.writeFile(join(projectPath, 'agent.md'), AGENT_MD_CONTENT_SCAMP, 'utf-8');
    await fs.writeFile(join(projectPath, 'CLAUDE.md'), CLAUDE_MD_CONTENT, 'utf-8');
    // The template ignores all of `.scamp`; the agent's conversations are
    // shared with the project, so they're let back in.
    const gitignorePath = join(projectPath, '.gitignore');
    const gitignore = await fs.readFile(gitignorePath, 'utf-8');
    await fs.writeFile(gitignorePath, `${shareAgentHistory(gitignore)}\n# Scamp MCP server registration (machine-local — do not commit)\n.mcp.json\n`, 'utf-8');
    await fs.mkdir(join(projectPath, 'public', 'assets'), { recursive: true });
};
