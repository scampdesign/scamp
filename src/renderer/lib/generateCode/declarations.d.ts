import { type BreakpointOverride, type ScampElement } from "../element";
/**
 * The `width:` / `height:` lines for one element, measured against the
 * default set that applies to it.
 *
 * The 'auto' mode is the implicit CSS default (no declaration), so it
 * deliberately emits nothing — that's how round-trips stay text-stable for
 * files that simply omit a width or height.
 *
 * Split out because a component instance emits ONLY these two properties
 * (everything else about an instance lives in the component definition).
 * see docs/notes/components-data-model.md
 */
/**
 * `width` / `height` for one element.
 *
 * A fixed size is ALWAYS emitted, even when it equals the default. Every
 * other property here is skipped when it matches its default, which is
 * safe because "absent" and "the default" mean the same thing in CSS —
 * absent `opacity` is 1. That does not hold for size: absent `width` is
 * `auto`, which is a different rendering entirely.
 *
 * Skipping it broke two things at once. A rectangle drawn at exactly
 * 100px wide lost its width in the generated CSS, so the canvas showed
 * 100px (from the model) and the browser showed a content-sized box. And
 * it violated the round-trip invariant: `parseCode` reads an absent width
 * as `auto`, not as fixed-at-the-default, so fixed/100 in, auto out.
 *
 * There is no risk of pinning agent-written elements that have no width:
 * those parse as `auto`, and only `fixed` emits a length here.
 */
/**
 * How a `stretch` height is written for a flex child, if specially at all:
 * `flex: 1` on a column's main axis, `align-self: stretch` on a row's
 * cross axis — but only while `alignSelf` is unset (or already stretch),
 * so a user-set alignment is never contradicted by a second line. Shared
 * with the flex-item block below, which must not repeat that line.
 */
export declare const fillHeightKind: (el: ScampElement, parent?: ScampElement | null) => "flex" | "align-self" | null;
/**
 * A component instance's page rule: its size, and where the page places it.
 * Placement is written only for an instance out of its parent's flow
 * (`position: auto` in a parent that doesn't lay it out, or an explicit
 * `absolute` / `fixed`): in a flex or grid parent, or a slot, the layout
 * places it, as it does any element. Empty when the page sets neither, so
 * an instance at its own size in the flow keeps a bare tag.
 */
export declare const instanceRuleLines: (el: ScampElement, parent?: ScampElement | null) => string[];
export declare const sizeDeclarationLines: (el: ScampElement, parent?: ScampElement | null) => string[];
/**
 * Build the list of `prop: value;` lines for one element. Skips anything
 * equal to its default; appends customProperties verbatim at the end.
 *
 * Exported so the properties panel can render what would be written to
 * disk for the selected element without having to re-implement the rules.
 */
export declare const elementDeclarationLines: (el: ScampElement, parent?: ScampElement | null, 
/**
 * When true, this element has at least one descendant that will
 * be `position: absolute` and would otherwise escape to a remote
 * ancestor's positioning context (or all the way to `.root`).
 * We emit `position: relative` here so the descendant anchors
 * locally — even when `el.position === 'auto'` would normally
 * emit nothing. See `computeElementsNeedingPositioningContext`.
 */
mustEstablishPositioningContext?: boolean) => string[];
/**
 * Emit CSS declarations for a single breakpoint override. Unlike
 * `elementDeclarationLines` (which skips values equal to defaults),
 * this emits a declaration for every field explicitly set in the
 * override — the override's presence IS the user's intent.
 *
 * Paired with the element so width/height declarations can resolve
 * the mode+value combination. When only `widthMode` is in the
 * override, the value falls back to the element's base value.
 */
export declare const breakpointOverrideLines: (override: BreakpointOverride, element: ScampElement, 
/** Decides the `align-self` spelling; omitted by callers without one. */
parent?: ScampElement | null) => string[];
