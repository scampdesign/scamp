/**
 * CSS assembly for the HTML export.
 *
 * Every instance of a component gets its own copy of that component's CSS,
 * prefixed with the instance id, appended to the page's stylesheet. That is
 * what makes the export match the canvas: an instance's rules can't be
 * shared with, or overwritten by, another instance's, and the page's own
 * per-instance rule keeps applying on top exactly as it does in the app.
 *
 * The rewriting here is textual, so it's written to survive CSS the
 * generator didn't write — a hand-edited or agent-edited component module
 * can contain descendant selectors, attribute selectors and strings, all of
 * which a "prefix the first token" regex would corrupt.
 *
 * see docs/archive/2026-08-27-html-export-plan.md
 */
/**
 * Prefix every class name in one selector list.
 *
 * Strings and attribute-selector bodies are copied through untouched: a
 * `[data-x=".foo"]` or `content: "."` must not be treated as a class.
 */
export declare const prefixSelectorClasses: (selector: string, prefix: string) => string;
/** Names declared by `@keyframes` blocks in this stylesheet. */
export declare const collectKeyframeNames: (css: string) => ReadonlySet<string>;
/**
 * Namespace a whole stylesheet under `prefix`.
 *
 * Rewrites class selectors at every nesting level (so rules inside
 * `@media` are covered), `@keyframes` names, and the `animation`
 * declarations that reference them. At-rule preludes other than
 * `@keyframes` — `@media`, `@supports` — pass through untouched.
 */
export declare const prefixCss: (css: string, prefix: string) => string;
/**
 * Rewrite `url(...)` targets. Used to turn project-absolute asset paths
 * (`/assets/hero.webp`) into paths relative to the page that loads the
 * stylesheet. Quoted and bare forms both round-trip.
 */
export declare const rewriteCssUrls: (css: string, rewrite: (url: string) => string) => string;
/**
 * Assemble one page's stylesheet: the page's own rules, then one prefixed
 * copy of each instance's component CSS.
 *
 * Page rules come first so a page's per-instance override (`.inst_a024`)
 * appears before the component's rules in source order — which is what the
 * app does too, since the component's stylesheet is imported by the
 * component and the page's by the page. Equal-specificity ties therefore
 * resolve the same way in both.
 */
export type InstanceStyles = {
    /** Full class prefix for this instance, e.g. `inst_a024__`. */
    prefix: string;
    /** The component's generated CSS. */
    css: string;
};
export declare const assemblePageCss: (pageCss: string, instances: ReadonlyArray<InstanceStyles>) => string;
