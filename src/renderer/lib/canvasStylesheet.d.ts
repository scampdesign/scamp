/**
 * The page's own CSS, injected into the canvas.
 *
 * The canvas has always re-derived styles from the element model into
 * inline styles, which means every property is a chance to translate
 * wrongly — and some CSS has no inline form at all, so it never rendered:
 * `::before` / `::after`, `:nth-child`, and any hand-written selector.
 *
 * Rather than teach the translator more tricks, the canvas now also loads
 * the exact stylesheet the generator writes to disk. Inline styles still
 * win on the properties they set, so this is additive: it supplies only
 * what the translation could never express. Later phases move properties
 * out of the inline layer and let these rules take over.
 *
 * see docs/plans/canvas-preview-parity-plan.md
 */
/** Attribute marking the canvas frame, used as the `@scope` root. */
export declare const CANVAS_SCOPE_ATTR = "data-scamp-canvas";
/** The selector the page's rules are scoped to. */
export declare const CANVAS_SCOPE_SELECTOR = "[data-scamp-canvas]";
export declare const stripStrippedAtRules: (css: string) => string;
/** True when every feature in a media prelude is width-based. */
export declare const isWidthOnlyQuery: (prelude: string) => boolean;
/**
 * Rewrite width-based `@media` blocks as `@container` queries.
 *
 * A media query is evaluated against the DOCUMENT viewport — the Electron
 * window — while Scamp's breakpoints size the canvas frame. Left as-is,
 * mobile rules fire on a desktop artboard whenever the app window happens
 * to be narrow, and never fire on a mobile artboard in a maximised window.
 *
 * The frame declares `container-type: inline-size`, so the identical
 * conditions evaluated as container queries resolve against the artboard
 * — which is what the preview's viewport means for the design.
 *
 * This is a translation, and worth being honest about that. It is one
 * lossless rewrite of a prelude across the whole sheet, not a re-derivation
 * of each property, and the parity harness checks it at several artboard
 * widths. That is a different kind of risk from the inline translation
 * layer this work exists to remove.
 *
 * Non-width queries are untouched: `prefers-color-scheme` and friends
 * describe the real device and should keep answering for it.
 */
export declare const mediaToContainer: (css: string) => string;
/**
 * Whether a width-only media prelude matches a viewport `width` wide, or
 * null when it says something this can't decide (`not`, `print`, a unit
 * other than px / em / rem).
 */
export declare const mediaMatchesWidth: (prelude: string, width: number) => boolean | null;
/**
 * Resolve width-based `@media` blocks for a viewport `width` wide: a block
 * that matches is unwrapped, one that doesn't is dropped. For the component
 * editor, whose frame is the component's own size rather than a viewport —
 * evaluated there as container queries, a 232px sidebar read every
 * `(max-width: 768px)` rule as true while the panel said Desktop. A prelude
 * it can't decide becomes a container query, as on a page.
 * see docs/notes/canvas-injected-stylesheet.md
 */
export declare const mediaForViewport: (css: string, width: number) => string;
export declare const buildCanvasStylesheet: (css: string, scopeSelector?: string, 
/** The viewport width to resolve `@media` for; omit to follow the frame. */
viewportWidth?: number) => string;
