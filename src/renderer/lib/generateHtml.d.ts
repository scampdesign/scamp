/**
 * Static HTML export — the model-side sibling of `generateCode`.
 *
 * `generateCode` emits TSX for the running Next project; this emits plain
 * HTML for a self-contained folder the user can open or upload. Both walk
 * the same element model and share `classNameFor` / `tagFor` / `escapeHtml`,
 * so the class names in the markup can't drift from the ones in the CSS.
 *
 * The defining difference is component instances. TSX emits a reference
 * (`<SidebarRow label="home" />`) and lets React resolve it; HTML has no
 * such indirection, so every instance is expanded in place into ordinary
 * elements, with its classes prefixed by the instance id. That prefix is
 * what keeps two instances of one component — and a component root vs. a
 * page root, which are both `.root` — from colliding once the stylesheets
 * are flattened into one document.
 *
 * see docs/archive/2026-08-27-html-export-plan.md
 */
import { type ScampElement } from './element';
/**
 * Mirrors `ComponentTree` in the canvas store. Redeclared here because
 * `lib/` must not import from `store/` — same approach as
 * `componentUsage.ts`.
 */
export type ComponentTree = {
    elements: Record<string, ScampElement>;
    rootId: string;
};
/**
 * Joins an instance id to the classes of the component it expands.
 * Double underscore because a single one is already common inside
 * generated class names (`hero_card_a1b2`).
 */
export declare const INSTANCE_CLASS_SEPARATOR = "__";
/** The class prefix applied to everything inside one expanded instance. */
export declare const instanceClassPrefix: (outerPrefix: string, instanceClass: string) => string;
export type HtmlExportOptions = {
    /** Every component in the project, keyed by PascalCase name. */
    componentTrees: Record<string, ComponentTree>;
    /** Map a route href (`/about`) to its exported path. Identity if absent. */
    rewriteHref?: (href: string) => string;
    /** Map an asset URL (`/assets/x.webp`) to a page-relative path. */
    rewriteAssetUrl?: (url: string) => string;
};
/**
 * Convert one captured text fragment to what JSX would actually render.
 *
 * The parser stores the raw source between element children, so a text
 * fragment can contain JSX comments and the indentation around them. JSX
 * renders neither: a comment produces nothing, and whitespace spanning a
 * newline is stripped. Emitting the source verbatim put the section-divider
 * comments from an agent-written page on the exported page as visible text.
 *
 * Returns null when the fragment renders to nothing.
 */
export declare const jsxTextToHtml: (raw: string) => string | null;
/**
 * Render a page's element tree as HTML. `level` starts at 2 so the markup
 * sits correctly inside the `<body>` produced by `renderDocument`.
 */
export declare const generateHtml: (elements: Record<string, ScampElement>, rootId: string, options: HtmlExportOptions) => string;
/** One expanded instance: which component, and under which class prefix. */
export type ExpandedInstance = {
    prefix: string;
    componentName: string;
};
/**
 * The instances `generateHtml` would expand for this page, in document
 * order — each one needing a prefixed copy of its component's CSS.
 *
 * Deliberately next to the renderer and sharing `instanceClassPrefix` with
 * it: if the two disagreed about a prefix, the markup would reference class
 * names the stylesheet never defines, and the page would silently lose its
 * styling. `test/generateHtml.test.ts` asserts they agree.
 */
export declare const collectExpandedInstances: (elements: Record<string, ScampElement>, rootId: string, componentTrees: Record<string, ComponentTree>) => ExpandedInstance[];
export type DocumentOptions = {
    /** `<title>`; the project name, matching `layout.tsx`'s metadata. */
    title: string;
    /** Page-relative hrefs for the stylesheets, in link order. */
    stylesheets: ReadonlyArray<string>;
    lang?: string;
};
/**
 * Wrap page markup in the document shell.
 *
 * The `<body>` inline style reproduces the project's own `app/layout.tsx`
 * (`margin: 0; min-height: 100vh`) rather than inventing a reset, so an
 * exported page and Preview lay out identically.
 */
export declare const renderDocument: (body: string, { title, stylesheets, lang }: DocumentOptions) => string;
