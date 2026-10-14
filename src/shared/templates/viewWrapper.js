/**
 * The one-line Next.js page that renders a view, so a `views/<Name>/`
 * file previews through `next dev` until the framework's own dev
 * server exists. App-owned and regenerated; never listed as a page.
 * see docs/archive/2026-09-16-framework-phase-1-plan.md, step 2
 */
export const viewWrapperTsx = (viewName) => `import ${viewName} from '@/views/${viewName}/${viewName}';

export default function ${viewName}Page() {
  return <${viewName} />;
}
`;
const VIEW_WRAPPER_RE = /^import\s+([A-Z][A-Za-z0-9]*)\s+from\s+'@\/views\/\1\/\1';\s*\n\s*export\s+default\s+function\s+\1Page\s*\(\s*\)\s*\{\s*return\s+<\1\s*\/>;\s*\}\s*$/;
/** The view a wrapper page renders, or null when the file isn't one. */
export const parseViewWrapper = (tsx) => {
    const match = VIEW_WRAPPER_RE.exec(tsx.trim());
    return match?.[1] ?? null;
};
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
export const viewNameForPage = (pageName) => pageName
    .split(/[-_]/)
    .filter((p) => p.length > 0)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
export const viewSlugFor = (viewName) => viewName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
