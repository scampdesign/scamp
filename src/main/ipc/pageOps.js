import { promises as fs } from 'fs';
import { join } from 'path';
import { DEFAULT_PAGE_CSS, defaultPageTsx } from '@shared/agentMd';
const PAGE_NAME_RE = /^[a-zA-Z0-9-]+$/;
const componentNameFromPage = (pageName) => {
    return pageName
        .split(/[-_]/)
        .filter((part) => part.length > 0)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
};
const pathExists = async (p) => {
    try {
        await fs.access(p);
        return true;
    }
    catch {
        return false;
    }
};
/**
 * Resolve the on-disk paths for a page given the project format.
 * Legacy: `<root>/<page>.tsx` + `<root>/<page>.module.css`.
 * Nextjs root/home page: `<root>/app/page.tsx` + `<root>/app/page.module.css`.
 * Nextjs other pages: `<root>/app/<page>/page.tsx` + `<root>/app/<page>/page.module.css`.
 */
export const pagePathsFor = (projectPath, pageName, format) => {
    if (format === 'legacy') {
        return {
            tsxPath: join(projectPath, `${pageName}.tsx`),
            cssPath: join(projectPath, `${pageName}.module.css`),
            pageDir: null,
        };
    }
    if (pageName === 'home') {
        const appDir = join(projectPath, 'app');
        return {
            tsxPath: join(appDir, 'page.tsx'),
            cssPath: join(appDir, 'page.module.css'),
            // The home page's parent dir (`app/`) is shared with siblings, so
            // it must NOT be removed on delete. Signal that with a null.
            pageDir: null,
        };
    }
    const pageDir = join(projectPath, 'app', pageName);
    return {
        tsxPath: join(pageDir, 'page.tsx'),
        cssPath: join(pageDir, 'page.module.css'),
        pageDir,
    };
};
const cssModuleImportNameFor = (format, pageName) => (format === 'nextjs' ? 'page' : pageName);
export const createPage = async (args, format) => {
    if (!PAGE_NAME_RE.test(args.pageName)) {
        throw new Error(`Invalid page name "${args.pageName}". Use alphanumeric and hyphens only.`);
    }
    if (format === 'scamp') {
        throw new Error('A Scamp-format project has no pages; add a view instead.');
    }
    if (format === 'nextjs' && args.pageName === 'home') {
        throw new Error(`A page named "home" already exists.`);
    }
    const { tsxPath, cssPath, pageDir } = pagePathsFor(args.projectPath, args.pageName, format);
    if ((await pathExists(tsxPath)) || (await pathExists(cssPath))) {
        throw new Error(`A page named "${args.pageName}" already exists.`);
    }
    if (pageDir) {
        if (await pathExists(pageDir)) {
            throw new Error(`A page named "${args.pageName}" already exists.`);
        }
        await fs.mkdir(pageDir, { recursive: false });
    }
    const componentName = componentNameFromPage(args.pageName);
    const importName = cssModuleImportNameFor(format, args.pageName);
    const tsxContent = defaultPageTsx(componentName, args.pageName, importName);
    const cssContent = DEFAULT_PAGE_CSS;
    await fs.writeFile(tsxPath, tsxContent, 'utf-8');
    await fs.writeFile(cssPath, cssContent, 'utf-8');
    return { name: args.pageName, tsxPath, cssPath, tsxContent, cssContent };
};
export const deletePage = async (args, format) => {
    if (!PAGE_NAME_RE.test(args.pageName)) {
        throw new Error(`Invalid page name "${args.pageName}".`);
    }
    if (format === 'nextjs' && args.pageName === 'home') {
        throw new Error(`The "home" page can't be deleted in a Next.js project.`);
    }
    const { tsxPath, cssPath, pageDir } = pagePathsFor(args.projectPath, args.pageName, format);
    await fs.rm(tsxPath, { force: true });
    await fs.rm(cssPath, { force: true });
    if (pageDir) {
        try {
            const remaining = await fs.readdir(pageDir);
            if (remaining.length === 0) {
                await fs.rmdir(pageDir);
            }
        }
        catch {
            // Folder doesn't exist or unreadable — nothing to clean up.
        }
    }
};
/**
 * Rewrite the CSS-module import line and the default-export component
 * name in a page's TSX so it matches the new page name. If either
 * rewrite fails to match, the TSX is returned unchanged — the copied
 * page still works, it just keeps the source's component name.
 */
const rewriteDuplicateTsx = (tsx, format, sourcePageName, newPageName, newComponentName) => {
    let out = tsx;
    if (format === 'legacy') {
        const importRe = new RegExp(`(import\\s+styles\\s+from\\s+['"]\\.\\/)${sourcePageName.replace(/-/g, '\\-')}(\\.module\\.css['"];?)`);
        out = out.replace(importRe, `$1${newPageName}$2`);
    }
    // Nextjs: import is always `./page.module.css` regardless of slug.
    out = out.replace(/(export\s+default\s+function\s+)[A-Za-z_][A-Za-z0-9_]*(\s*\()/, `$1${newComponentName}$2`);
    return out;
};
export const duplicatePage = async (args, format) => {
    if (!PAGE_NAME_RE.test(args.newPageName)) {
        throw new Error(`Invalid page name "${args.newPageName}". Use alphanumeric and hyphens only.`);
    }
    if (format === 'nextjs' && args.newPageName === 'home') {
        throw new Error(`A page named "home" already exists.`);
    }
    if (!PAGE_NAME_RE.test(args.sourcePageName)) {
        throw new Error(`Invalid page name "${args.sourcePageName}".`);
    }
    const source = pagePathsFor(args.projectPath, args.sourcePageName, format);
    const dest = pagePathsFor(args.projectPath, args.newPageName, format);
    if ((await pathExists(dest.tsxPath)) || (await pathExists(dest.cssPath))) {
        throw new Error(`A page named "${args.newPageName}" already exists.`);
    }
    if (!(await pathExists(source.tsxPath)) || !(await pathExists(source.cssPath))) {
        throw new Error(`Source page "${args.sourcePageName}" is missing.`);
    }
    if (dest.pageDir && (await pathExists(dest.pageDir))) {
        throw new Error(`A page named "${args.newPageName}" already exists.`);
    }
    if (dest.pageDir) {
        await fs.mkdir(dest.pageDir, { recursive: false });
    }
    const [sourceTsx, sourceCss] = await Promise.all([
        fs.readFile(source.tsxPath, 'utf-8'),
        fs.readFile(source.cssPath, 'utf-8'),
    ]);
    const newComponentName = componentNameFromPage(args.newPageName);
    const newTsx = rewriteDuplicateTsx(sourceTsx, format, args.sourcePageName, args.newPageName, newComponentName);
    await fs.writeFile(dest.tsxPath, newTsx, 'utf-8');
    await fs.writeFile(dest.cssPath, sourceCss, 'utf-8');
    return {
        name: args.newPageName,
        tsxPath: dest.tsxPath,
        cssPath: dest.cssPath,
        tsxContent: newTsx,
        cssContent: sourceCss,
    };
};
