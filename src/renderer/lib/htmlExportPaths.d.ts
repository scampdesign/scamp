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
/** Scamp's internal name for the page that lives at the site root. */
export declare const HOME_PAGE = "home";
/** How many directory levels down from the export root a page sits. */
export declare const pageDepth: (pageName: string) => number;
/** Path of a page's HTML file, relative to the export root. */
export declare const htmlPathFor: (pageName: string) => string;
/** Path of a page's stylesheet, relative to the export root. */
export declare const cssPathFor: (pageName: string) => string;
/**
 * The `../` chain that climbs from a page back to the export root. Root-level
 * pages get `''`. Everything shared — `theme.css`, `assets/` — is addressed
 * through this.
 */
export declare const rootRelativePrefix: (depth: number) => string;
/** A page-relative reference to something at the export root. */
export declare const fromPageToRoot: (pageName: string, target: string) => string;
/**
 * Rewrite a project asset URL for use inside a given page.
 *
 * Next-format projects reference assets from the server root
 * (`/assets/hero.webp`); opened as a `file://` page that would point at the
 * filesystem root. Legacy projects already use `./assets/...`. Both land on
 * a path relative to the page. Anything absolute (`https://…`, `data:`) is
 * left alone.
 */
export declare const rewriteAssetUrlForPage: (url: string, pageName: string) => string;
/**
 * Rewrite a link for use inside a given page.
 *
 * Only routes that name a real page are rewritten. An external URL, an
 * anchor, or a deeper path we don't own (`/about/team` — pages can't nest,
 * so nothing in the export corresponds to it) passes through untouched
 * rather than being pointed at a file that doesn't exist.
 */
export declare const rewriteHrefForPage: (href: string, fromPage: string, pageNames: ReadonlyArray<string>) => string;
