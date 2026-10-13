import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { projectTemplate, viewTemplate } from 'scampjs/templates';
import { AGENT_MD_CONTENT, AGENT_MD_CONTENT_LEGACY, AGENT_MD_CONTENT_SCAMP, CLAUDE_MD_CONTENT, DEFAULT_NEXT_CONFIG_TS, DEFAULT_PAGE_CSS, DEFAULT_THEME_CSS, defaultLayoutTsx, defaultPackageJson, defaultPageTsx, } from '../../../src/shared/agentMd';
import { viewNameForPage } from '../../../src/shared/templates';
const componentNameFromPage = (pageName) => pageName
    .split(/[-_]/)
    .filter((p) => p.length > 0)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
const writePage = async (dir, name) => {
    await fs.writeFile(path.join(dir, `${name}.tsx`), defaultPageTsx(componentNameFromPage(name), name), 'utf-8');
    await fs.writeFile(path.join(dir, `${name}.module.css`), DEFAULT_PAGE_CSS, 'utf-8');
};
/**
 * The format a project gets when a spec doesn't pin one. Exported so a
 * spec that must branch at MODULE scope (a seeded file's content, say)
 * reads the same answer the fixture will use, rather than re-deriving
 * it from the env var and getting it wrong the moment the default
 * changes. Inside a test, prefer `project.format`.
 */
export const defaultTestFormat = () => {
    const env = process.env['SCAMP_E2E_FORMAT'];
    return env === 'legacy' || env === 'nextjs' ? env : 'scamp';
};
const defaultComponentTsx = (componentName) => `import styles from './${componentName}.module.css';

export default function ${componentName}() {
  return (
    <div data-scamp-id="root" className={styles.root}>
    </div>
  );
}
`;
const writeNextjsPage = async (dir, pageName, isHome) => {
    const pageDir = isHome ? path.join(dir, 'app') : path.join(dir, 'app', pageName);
    await fs.mkdir(pageDir, { recursive: true });
    await fs.writeFile(path.join(pageDir, 'page.tsx'), defaultPageTsx(componentNameFromPage(pageName), pageName, 'page'), 'utf-8');
    await fs.writeFile(path.join(pageDir, 'page.module.css'), DEFAULT_PAGE_CSS, 'utf-8');
};
const writeComponent = async (dir, seed) => {
    const componentDir = path.join(dir, 'components', seed.name);
    await fs.mkdir(componentDir, { recursive: true });
    await fs.writeFile(path.join(componentDir, `${seed.name}.tsx`), seed.tsxContent ?? defaultComponentTsx(seed.name), 'utf-8');
    await fs.writeFile(path.join(componentDir, `${seed.name}.module.css`), seed.cssContent ?? '.root {\n}\n', 'utf-8');
};
/** A view plus its route, as `Add page` writes them in a framework project. */
const writeScampView = async (dir, slug) => {
    const view = viewNameForPage(slug);
    for (const [relative, content] of Object.entries(viewTemplate(view))) {
        await fs.mkdir(path.dirname(path.join(dir, relative)), { recursive: true });
        await fs.writeFile(path.join(dir, relative), content, 'utf-8');
    }
    await fs.writeFile(path.join(dir, 'routes', `${slug}.tsx`), `import ${view} from '@/views/${view}/${view}';\n\nexport const render = 'static';\n\nexport default function ${view}Route() {\n  return <${view} />;\n}\n`, 'utf-8');
};
export const createTestProject = async (options = {}) => {
    const opts = typeof options === 'string' ? { name: options } : options;
    const name = opts.name ?? 'scamp-e2e';
    const envFormat = process.env['SCAMP_E2E_FORMAT'];
    // Defaults to `scamp`: the framework layout is the one a release has
    // to protect, and a default of `legacy` meant a plain
    // `npx playwright test` exercised the format that matters least —
    // which is how 24 scamp failures sat undiscovered until someone
    // remembered the env var. A spec that pins `opts.format` still wins.
    // see docs/plans/framework-release-readiness.md
    const format = opts.format ??
        (envFormat === 'legacy' || envFormat === 'nextjs' ? envFormat : defaultTestFormat());
    const extraPages = opts.extraPages ?? [];
    const components = opts.components ?? [];
    const pageContent = opts.pageContent ?? {};
    const copied = opts.sourceDir !== undefined;
    if (format === 'legacy' && components.length > 0) {
        throw new Error('createTestProject: legacy projects don\'t support components. Use format: "nextjs".');
    }
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-e2e-'));
    const dir = path.join(root, name);
    await fs.mkdir(dir, { recursive: false });
    if (opts.sourceDir !== undefined) {
        await fs.cp(opts.sourceDir, dir, { recursive: true });
    }
    const pageName = 'home';
    if (copied) {
        // A copied project brings its own files; nothing to scaffold.
    }
    else if (format === 'scamp') {
        // The framework's own templates, as the app's New project writes them.
        for (const [relative, content] of Object.entries(projectTemplate({ name, scampjsVersion: '^0.3.0' }))) {
            await fs.mkdir(path.dirname(path.join(dir, relative)), { recursive: true });
            await fs.writeFile(path.join(dir, relative), content, 'utf-8');
        }
        await fs.writeFile(path.join(dir, 'agent.md'), AGENT_MD_CONTENT_SCAMP, 'utf-8');
        // Stand in for an installed framework so the "scampjs isn't installed"
        // banner doesn't sit above the canvas and shift every coordinate.
        await fs.mkdir(path.join(dir, 'node_modules', 'scampjs'), { recursive: true });
        await fs.writeFile(path.join(dir, 'node_modules', 'scampjs', 'package.json'), JSON.stringify({ name: 'scampjs', version: '0.3.0', scampjs: { contract: 2 } }), 'utf-8');
        for (const extra of extraPages) {
            await writeScampView(dir, extra);
        }
        await fs.mkdir(path.join(dir, 'public', 'assets'), { recursive: true });
        for (const seed of components) {
            await writeComponent(dir, seed);
        }
    }
    else if (format === 'legacy') {
        await fs.writeFile(path.join(dir, 'agent.md'), AGENT_MD_CONTENT_LEGACY, 'utf-8');
        await writePage(dir, pageName);
        for (const extra of extraPages) {
            await writePage(dir, extra);
        }
        await fs.writeFile(path.join(dir, 'theme.css'), DEFAULT_THEME_CSS, 'utf-8');
    }
    else {
        await fs.writeFile(path.join(dir, 'agent.md'), AGENT_MD_CONTENT, 'utf-8');
        await fs.writeFile(path.join(dir, 'CLAUDE.md'), CLAUDE_MD_CONTENT, 'utf-8');
        await fs.writeFile(path.join(dir, 'package.json'), defaultPackageJson(name), 'utf-8');
        await fs.writeFile(path.join(dir, 'next.config.ts'), DEFAULT_NEXT_CONFIG_TS, 'utf-8');
        const appDir = path.join(dir, 'app');
        await fs.mkdir(appDir, { recursive: false });
        await fs.writeFile(path.join(appDir, 'layout.tsx'), defaultLayoutTsx(name), 'utf-8');
        await fs.writeFile(path.join(appDir, 'theme.css'), DEFAULT_THEME_CSS, 'utf-8');
        await writeNextjsPage(dir, pageName, true);
        for (const extra of extraPages) {
            await writeNextjsPage(dir, extra, false);
        }
        await fs.mkdir(path.join(dir, 'public', 'assets'), { recursive: true });
        for (const seed of components) {
            await writeComponent(dir, seed);
        }
    }
    // Apply per-page content overrides on top of the scaffolded files.
    // Runs BEFORE the app launches so chokidar / format-migration don't
    // race the test's seed write.
    for (const [pn, overrides] of Object.entries(pageContent)) {
        const tsxPath = format === 'scamp'
            ? path.join(dir, 'views', viewNameForPage(pn), `${viewNameForPage(pn)}.tsx`)
            : format === 'nextjs'
                ? path.join(dir, 'app', pn === pageName ? 'page.tsx' : path.join(pn, 'page.tsx'))
                : path.join(dir, `${pn}.tsx`);
        const cssPath = format === 'scamp'
            ? path.join(dir, 'views', viewNameForPage(pn), `${viewNameForPage(pn)}.module.css`)
            : format === 'nextjs'
                ? path.join(dir, 'app', pn === pageName ? 'page.module.css' : path.join(pn, 'page.module.css'))
                : path.join(dir, `${pn}.module.css`);
        if (overrides.tsx !== undefined) {
            await fs.writeFile(tsxPath, overrides.tsx, 'utf-8');
        }
        if (overrides.css !== undefined) {
            await fs.writeFile(cssPath, overrides.css, 'utf-8');
        }
    }
    // Suppress the legacy → nextjs migration banner during tests.
    await fs.writeFile(path.join(dir, 'scamp.config.json'), JSON.stringify({
        nextjsMigrationDismissed: true,
        ...(opts.scampMigrationBanner === true ? {} : { scampMigrationDismissed: true }),
    }, null, 2) + '\n', 'utf-8');
    const homeTsxPath = format === 'scamp'
        ? path.join('views', 'Home', 'Home.tsx')
        : format === 'nextjs'
            ? path.join('app', 'page.tsx')
            : `${pageName}.tsx`;
    const homeCssPath = format === 'scamp'
        ? path.join('views', 'Home', 'Home.module.css')
        : format === 'nextjs'
            ? path.join('app', 'page.module.css')
            : `${pageName}.module.css`;
    const themePath = format === 'scamp'
        ? path.join('design', 'theme.css')
        : format === 'nextjs'
            ? path.join('app', 'theme.css')
            : 'theme.css';
    const read = (file) => fs.readFile(path.join(dir, file), 'utf-8');
    const readPage = async (pn) => {
        if (format === 'scamp') {
            const view = viewNameForPage(pn);
            const tsx = await read(path.join('views', view, `${view}.tsx`));
            const css = await read(path.join('views', view, `${view}.module.css`));
            return { tsx, css };
        }
        if (format === 'nextjs') {
            const pageDir = pn === pageName ? 'app' : path.join('app', pn);
            const tsx = await read(path.join(pageDir, 'page.tsx'));
            const css = await read(path.join(pageDir, 'page.module.css'));
            return { tsx, css };
        }
        const tsx = await read(`${pn}.tsx`);
        const css = await read(`${pn}.module.css`);
        return { tsx, css };
    };
    const componentFilesFor = (componentName) => ({
        tsxPath: path.join(dir, 'components', componentName, `${componentName}.tsx`),
        cssPath: path.join(dir, 'components', componentName, `${componentName}.module.css`),
    });
    const readComponent = async (componentName) => {
        const { tsxPath, cssPath } = componentFilesFor(componentName);
        const [tsx, css] = await Promise.all([
            fs.readFile(tsxPath, 'utf-8'),
            fs.readFile(cssPath, 'utf-8'),
        ]);
        return { tsx, css };
    };
    const componentExists = async (componentName) => {
        // macOS APFS is case-insensitive by default, so `fs.access` on
        // `components/button/button.tsx` resolves to `components/Button/Button.tsx`
        // and returns true even though no `button` folder exists. List the
        // parent directories and string-compare so the check matches exactly
        // on Linux CI and macOS dev machines.
        try {
            const componentsDirEntries = await fs.readdir(path.join(dir, 'components'));
            if (!componentsDirEntries.includes(componentName))
                return false;
            const componentDirEntries = await fs.readdir(path.join(dir, 'components', componentName));
            return componentDirEntries.includes(`${componentName}.tsx`);
        }
        catch {
            return false;
        }
    };
    const readView = async (viewName) => {
        const base = path.join(dir, 'views', viewName);
        const [tsx, css] = await Promise.all([
            fs.readFile(path.join(base, `${viewName}.tsx`), 'utf-8'),
            fs.readFile(path.join(base, `${viewName}.module.css`), 'utf-8'),
        ]);
        return { tsx, css };
    };
    const viewExists = async (viewName) => {
        try {
            const entries = await fs.readdir(path.join(dir, 'views'));
            if (!entries.includes(viewName))
                return false;
            const inner = await fs.readdir(path.join(dir, 'views', viewName));
            return inner.includes(`${viewName}.tsx`);
        }
        catch {
            return false;
        }
    };
    const readFile = (relative) => fs.readFile(path.join(dir, ...relative.split('/')), 'utf-8');
    const fileExists = async (relative) => {
        try {
            await fs.access(path.join(dir, ...relative.split('/')));
            return true;
        }
        catch {
            return false;
        }
    };
    const listSnapshotLabels = async () => {
        try {
            const raw = await fs.readFile(path.join(dir, '.scamp', 'snapshots.json'), 'utf-8');
            const parsed = JSON.parse(raw);
            const list = parsed?.snapshots;
            if (!Array.isArray(list))
                return [];
            return list
                .map((m) => (m && typeof m === 'object' && typeof m.label === 'string' ? m.label : null))
                .filter((l) => l !== null);
        }
        catch {
            return [];
        }
    };
    return {
        dir,
        name,
        pageName,
        format,
        listSnapshotLabels,
        readTsx: () => read(homeTsxPath),
        readCss: () => read(homeCssPath),
        tsxPath: path.join(dir, homeTsxPath),
        cssPath: path.join(dir, homeCssPath),
        themeCssPath: path.join(dir, themePath),
        assetsDirPath: path.join(dir, ...(format === 'legacy' ? ['assets'] : ['public', 'assets'])),
        pageLabelTsx: `${format === 'scamp' ? viewNameForPage(pageName) : pageName}.tsx`,
        pageLabelCss: `${format === 'scamp' ? viewNameForPage(pageName) : pageName}.module.css`,
        readPage,
        readComponent,
        componentExists,
        readView,
        viewExists,
        readFile,
        fileExists,
        readTheme: () => read(themePath),
        cleanup: async () => {
            await fs.rm(root, { recursive: true, force: true });
        },
    };
};
