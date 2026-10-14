/**
 * The one-line Next.js page that renders a view, so a `views/<Name>/`
 * file previews through `next dev` until the framework's own dev
 * server exists. App-owned and regenerated; never listed as a page.
 * see docs/archive/2026-09-16-framework-phase-1-plan.md, step 2
 */
export declare const viewWrapperTsx: (viewName: string) => string;
/** The view a wrapper page renders, or null when the file isn't one. */
export declare const parseViewWrapper: (tsx: string) => string | null;
/**
 * The page slug a view's wrapper lives at: PascalCase → kebab-case
 * (`HeroCard` → `hero-card`). `Home` maps to `home`, which is the root
 * page (`app/page.tsx`) in a Next.js project.
 */
/**
 * The view name a page converts to: kebab-case → PascalCase
 * (`checkout-flow` → `CheckoutFlow`). `viewSlugFor` inverts it for every
 * valid page name, so a converted page's wrapper sits where the view
 * expects it.
 */
export declare const viewNameForPage: (pageName: string) => string;
export declare const viewSlugFor: (viewName: string) => string;
