import { promises as fs } from 'fs';
import { join } from 'path';
import { readProjectNextjs } from './projectScaffold';
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
 * Rewrite the CSS-module import line. Returns `null` when the import
 * line can't be found — the caller decides whether that's a hard error
 * (rename) or a silent no-op (duplicate leaves the source component
 * name untouched).
 */
export const rewriteImportLine = (tsx, oldPageName, newPageName) => {
    const importRe = new RegExp(`(import\\s+styles\\s+from\\s+['"]\\.\\/)${oldPageName.replace(/-/g, '\\-')}(\\.module\\.css['"];?)`);
    if (!importRe.test(tsx))
        return null;
    return tsx.replace(importRe, `$1${newPageName}$2`);
};
const COMPONENT_FN_RE = /(export\s+default\s+function\s+)[A-Za-z_][A-Za-z0-9_]*(\s*\()/;
export const rewriteComponentName = (tsx, newComponentName) => {
    if (!COMPONENT_FN_RE.test(tsx))
        return null;
    return tsx.replace(COMPONENT_FN_RE, `$1${newComponentName}$2`);
};
/**
 * Rewrite every `href="/<oldSlug>..."` reference in a TSX source to
 * use `<newSlug>` instead. Anchored to the attribute syntax to avoid
 * mangling string literals that happen to contain a path-shaped
 * substring. Preserves anything after the slug (subpath, query,
 * fragment) so `href="/about/team#contact"` becomes
 * `href="/landing/team#contact"`.
 *
 * Returns the rewritten string. When no references match, the
 * original string is returned unchanged (callers can compare by
 * reference / value to skip unnecessary writes).
 */
export const rewriteHrefSlug = (tsx, oldSlug, newSlug) => {
    if (oldSlug === newSlug)
        return tsx;
    // Escape regex metacharacters in the slug. Page names are validated
    // to `[a-zA-Z0-9-]+` so the only meta is `-` which is harmless
    // outside character classes — escaping defensively keeps the helper
    // safe if validation ever loosens.
    const escapedOld = oldSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match `href="/<slug>` only when `<slug>` is immediately followed
    // by one of `"`, `'`, `/`, `?`, `#` (i.e. the slug is a complete
    // path segment, not a prefix of a longer slug like `about-us`).
    // The lookahead doesn't consume — only the leading `href="/<slug>`
    // is replaced, so anything after the slug (subpath, query,
    // fragment, closing quote) stays in place.
    const re = new RegExp(`(href\\s*=\\s*["']\\/)${escapedOld}(?=["'\\/?#])`, 'g');
    return tsx.replace(re, `$1${newSlug}`);
};
/**
 * Walk every page in a nextjs project and rewrite href references to
 * a renamed page. Skips the page being renamed itself (its content
 * has already been written by the rename flow). Suppresses the
 * resulting writes through the watcher so the renderer doesn't
 * double-parse.
 */
const refactorHrefReferences = async (projectPath, oldSlug, newSlug, excludeTsxPath, onSuppress) => {
    const pages = await readProjectNextjs(projectPath);
    for (const page of pages) {
        if (page.tsxPath === excludeTsxPath)
            continue;
        const next = rewriteHrefSlug(page.tsxContent, oldSlug, newSlug);
        if (next === page.tsxContent)
            continue;
        onSuppress?.(page.tsxPath);
        await fs.writeFile(page.tsxPath, next, 'utf-8');
    }
};
const pagePathsFor = (projectPath, pageName, format) => {
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
const renameLegacyFiles = async (paths, rewrittenTsx, oldCss, onSuppress) => {
    onSuppress?.(paths.oldTsxPath);
    onSuppress?.(paths.oldCssPath);
    onSuppress?.(paths.newTsxPath);
    onSuppress?.(paths.newCssPath);
    try {
        await fs.writeFile(paths.newTsxPath, rewrittenTsx, 'utf-8');
        await fs.writeFile(paths.newCssPath, oldCss, 'utf-8');
    }
    catch (err) {
        await fs.rm(paths.newTsxPath, { force: true }).catch(() => undefined);
        await fs.rm(paths.newCssPath, { force: true }).catch(() => undefined);
        throw err;
    }
    await fs.rm(paths.oldTsxPath, { force: true });
    await fs.rm(paths.oldCssPath, { force: true });
};
const renameNextjsFiles = async (paths, rewrittenTsx, oldCss, onSuppress) => {
    // For nextjs the CSS-module file basename is constant
    // (`page.module.css`), so the rename is really about moving the
    // containing folder. Only the TSX content actually changes (component
    // name). Doing it as separate writes (rather than `fs.rename` of the
    // folder) keeps the watcher's per-file `suppressNextChange` plumbing
    // working without changes.
    if (!paths.newPageDir) {
        throw new Error('Internal: cannot rename to a page that has no directory in nextjs format.');
    }
    await fs.mkdir(paths.newPageDir, { recursive: false });
    onSuppress?.(paths.oldTsxPath);
    onSuppress?.(paths.oldCssPath);
    onSuppress?.(paths.newTsxPath);
    onSuppress?.(paths.newCssPath);
    try {
        await fs.writeFile(paths.newTsxPath, rewrittenTsx, 'utf-8');
        await fs.writeFile(paths.newCssPath, oldCss, 'utf-8');
    }
    catch (err) {
        await fs.rm(paths.newTsxPath, { force: true }).catch(() => undefined);
        await fs.rm(paths.newCssPath, { force: true }).catch(() => undefined);
        await fs.rmdir(paths.newPageDir).catch(() => undefined);
        throw err;
    }
    await fs.rm(paths.oldTsxPath, { force: true });
    await fs.rm(paths.oldCssPath, { force: true });
    if (paths.oldPageDir) {
        // Best-effort cleanup — leave any agent leftovers in place.
        try {
            const remaining = await fs.readdir(paths.oldPageDir);
            if (remaining.length === 0) {
                await fs.rmdir(paths.oldPageDir);
            }
        }
        catch {
            // Folder doesn't exist or unreadable — nothing to clean up.
        }
    }
};
/**
 * Rename a page on disk. Writes the new files first, then deletes the
 * old ones, so a crash mid-rename leaves duplicate files rather than
 * no files — the user can reconcile on next project open.
 *
 * Fails hard if the TSX rewrite regexes don't match: a successful
 * rename that left the TSX importing a deleted CSS module would break
 * the page at render time.
 */
export const renamePageFiles = async (args, format, onSuppress) => {
    if (!PAGE_NAME_RE.test(args.newPageName)) {
        throw new Error(`Invalid page name "${args.newPageName}". Use alphanumeric and hyphens only.`);
    }
    if (!PAGE_NAME_RE.test(args.oldPageName)) {
        throw new Error(`Invalid page name "${args.oldPageName}".`);
    }
    if (args.oldPageName === args.newPageName) {
        throw new Error('New name is the same as the old one.');
    }
    if (format === 'nextjs') {
        if (args.oldPageName === 'home') {
            throw new Error(`The "home" page can't be renamed in a Next.js project — it must stay at app/page.tsx.`);
        }
        if (args.newPageName === 'home') {
            throw new Error(`A page named "home" already exists.`);
        }
    }
    const oldPaths = pagePathsFor(args.projectPath, args.oldPageName, format);
    const newPaths = pagePathsFor(args.projectPath, args.newPageName, format);
    const paths = {
        oldTsxPath: oldPaths.tsxPath,
        oldCssPath: oldPaths.cssPath,
        newTsxPath: newPaths.tsxPath,
        newCssPath: newPaths.cssPath,
        oldPageDir: oldPaths.pageDir,
        newPageDir: newPaths.pageDir,
    };
    if ((await pathExists(paths.newTsxPath)) ||
        (await pathExists(paths.newCssPath))) {
        throw new Error(`A page named "${args.newPageName}" already exists.`);
    }
    if (paths.newPageDir && (await pathExists(paths.newPageDir))) {
        throw new Error(`A page named "${args.newPageName}" already exists.`);
    }
    if (!(await pathExists(paths.oldTsxPath)) ||
        !(await pathExists(paths.oldCssPath))) {
        throw new Error(`Source page "${args.oldPageName}" is missing.`);
    }
    const [oldTsx, oldCss] = await Promise.all([
        fs.readFile(paths.oldTsxPath, 'utf-8'),
        fs.readFile(paths.oldCssPath, 'utf-8'),
    ]);
    // Legacy needs the CSS-module import rewritten to point at the new
    // basename. Nextjs's import is always `./page.module.css` so it's
    // already correct — no rewrite needed.
    let rewritten;
    if (format === 'legacy') {
        const withImport = rewriteImportLine(oldTsx, args.oldPageName, args.newPageName);
        if (withImport === null) {
            throw new Error(`Couldn't find the CSS-module import in ${args.oldPageName}.tsx — rename aborted.`);
        }
        const newComponentName = componentNameFromPage(args.newPageName);
        const withComponent = rewriteComponentName(withImport, newComponentName);
        if (withComponent === null) {
            throw new Error(`Couldn't find the default-export function in ${args.oldPageName}.tsx — rename aborted. Restore the default "export default function <Name>()" signature before retrying.`);
        }
        rewritten = withComponent;
    }
    else {
        const newComponentName = componentNameFromPage(args.newPageName);
        const withComponent = rewriteComponentName(oldTsx, newComponentName);
        if (withComponent === null) {
            throw new Error(`Couldn't find the default-export function in ${args.oldPageName}/page.tsx — rename aborted. Restore the default "export default function <Name>()" signature before retrying.`);
        }
        rewritten = withComponent;
    }
    if (format === 'legacy') {
        await renameLegacyFiles(paths, rewritten, oldCss, onSuppress);
    }
    else {
        await renameNextjsFiles(paths, rewritten, oldCss, onSuppress);
        // Refactor every other page's href references that used to point
        // at this page. Same suppression path so the watcher doesn't fire
        // a re-parse for these writes.
        await refactorHrefReferences(args.projectPath, args.oldPageName, args.newPageName, paths.newTsxPath, onSuppress);
    }
    return {
        name: args.newPageName,
        tsxPath: paths.newTsxPath,
        cssPath: paths.newCssPath,
        tsxContent: rewritten,
        cssContent: oldCss,
    };
};
