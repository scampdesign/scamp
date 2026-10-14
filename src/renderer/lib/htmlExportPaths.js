/**
 * Path and link mapping for the HTML export.
 *
 * Scamp page names are a single URL segment (`^[a-z0-9-]+$`, see
 * `shared/pageName.ts`), so the exported tree is at most one level deep:
 *
 *   home   → index.html          + index.css
 *   about  → about/index.html    + about/index.css
 *
 * `about/index.html` rather than `about.html` so a static host serves the
 * page at `/about` — the same route the project used — while the rewritten
 * links still resolve when the folder is opened straight off disk.
 *
 * see docs/archive/2026-08-27-html-export-plan.md
 */
import { classifyHref } from './linkHref';
/** Scamp's internal name for the page that lives at the site root. */
export const HOME_PAGE = 'home';
/** How many directory levels down from the export root a page sits. */
export const pageDepth = (pageName) => pageName === HOME_PAGE ? 0 : 1;
/** Path of a page's HTML file, relative to the export root. */
export const htmlPathFor = (pageName) => pageName === HOME_PAGE ? 'index.html' : `${pageName}/index.html`;
/** Path of a page's stylesheet, relative to the export root. */
export const cssPathFor = (pageName) => pageName === HOME_PAGE ? 'index.css' : `${pageName}/index.css`;
/**
 * The `../` chain that climbs from a page back to the export root. Root-level
 * pages get `''`. Everything shared — `theme.css`, `assets/` — is addressed
 * through this.
 */
export const rootRelativePrefix = (depth) => depth <= 0 ? '' : '../'.repeat(depth);
/** A page-relative reference to something at the export root. */
export const fromPageToRoot = (pageName, target) => `${rootRelativePrefix(pageDepth(pageName))}${target}`;
/**
 * Rewrite a project asset URL for use inside a given page.
 *
 * Next-format projects reference assets from the server root
 * (`/assets/hero.webp`); opened as a `file://` page that would point at the
 * filesystem root. Legacy projects already use `./assets/...`. Both land on
 * a path relative to the page. Anything absolute (`https://…`, `data:`) is
 * left alone.
 */
export const rewriteAssetUrlForPage = (url, pageName) => {
    const trimmed = url.trim();
    if (trimmed.length === 0)
        return url;
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) {
        return url;
    }
    const withoutPrefix = trimmed.startsWith('/')
        ? trimmed.slice(1)
        : trimmed.startsWith('./')
            ? trimmed.slice(2)
            : trimmed;
    return fromPageToRoot(pageName, withoutPrefix);
};
/**
 * Rewrite a link for use inside a given page.
 *
 * Only routes that name a real page are rewritten. An external URL, an
 * anchor, or a deeper path we don't own (`/about/team` — pages can't nest,
 * so nothing in the export corresponds to it) passes through untouched
 * rather than being pointed at a file that doesn't exist.
 */
export const rewriteHrefForPage = (href, fromPage, pageNames) => {
    const trimmed = href.trim();
    if (trimmed.length === 0)
        return href;
    // Exact route match only: `/about?q=1` and `/about/team` address things
    // this export doesn't produce.
    if (trimmed !== '/' && !/^\/[a-z0-9-]+$/i.test(trimmed))
        return href;
    const classified = classifyHref(trimmed, pageNames);
    if (classified.kind !== 'page')
        return href;
    return fromPageToRoot(fromPage, htmlPathFor(classified.pageName));
};
