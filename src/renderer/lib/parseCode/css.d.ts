import { type ElementStateName, type KeyframesBlock, type PropertyGroup, type RawSelectorBlock, type TableStyle, type VariantPick } from "../element";
import { type Breakpoint } from "@shared/types";
export type RawDeclaration = {
    prop: string;
    value: string;
};
type ClassDeclarations = Map<string, RawDeclaration[]>;
export type ParsedCss = {
    /** Base (non-@media) declarations keyed by class name. */
    byClass: ClassDeclarations;
    /**
     * Property groups toggled off for each class, union'd across
     * any blocks (base / breakpoint / state) where a label
     * appeared. Element-scoped: the consumer overlays this onto
     * `element.toggledOffGroups`.
     */
    toggledOffByClass: Map<string, PropertyGroup[]>;
    /**
     * `@media (max-width: Npx)` declarations whose N matches a known
     * breakpoint's width. Outer key is breakpoint id; inner key is
     * class name. Populated when the parser can route an @media block
     * to a known breakpoint.
     */
    byBreakpoint: Map<string, ClassDeclarations>;
    /**
     * Per-state declarations for the recognised pseudo-classes
     * (`:hover`, `:active`, `:focus`). Outer key is state name; inner
     * key is class name. Compound or unrecognised pseudo-class
     * selectors are stored in `rawByClass` instead.
     */
    byState: Map<ElementStateName, ClassDeclarations>;
    /**
     * Pseudo-class blocks the parser couldn't route to a recognised
     * state (`.foo:focus-visible`, `.foo:nth-child(odd)`,
     * `.foo:hover .child`, etc.). Keyed by the bare class name so the
     * blocks travel with the matching element. Order within the array
     * matches the source order so re-emit stays text-stable.
     */
    rawByClass: Map<string, RawSelectorBlock[]>;
    /**
     * Raw CSS text of @media blocks the parser couldn't route — either
     * the query shape isn't `(max-width: Npx)` or the width doesn't
     * match any known breakpoint. Preserved verbatim for round-trip.
     */
    customMediaBlocks: string[];
    /**
     * `@keyframes` blocks collected from the page, in source order.
     * Multiple elements can reference the same keyframe name; the
     * blocks travel together at the page level rather than per-element.
     */
    keyframesBlocks: KeyframesBlock[];
    /**
     * A table's row and cell styling, read back from the `:where()` rules
     * `@lib/tableStyle` derives. Keyed by the table's class name.
     */
    tableStyleByClass: Map<string, TableStyle>;
    /**
     * Variant-axis rules (`.root[data-variant="outline"] .label`), in source
     * order. Whether one is typed depends on the component's props type, so
     * `parseCode` decides; one it can't place goes back to the anchor
     * class's raw blocks verbatim. see docs/plans/component-variants-plan.md
     */
    axisRules: AxisRule[];
};
/** One `[data-<axis>="<value>"]` rule (several, for a combination), as read and as written. */
export type AxisRule = {
    /** The class carrying the attributes: the component's root. */
    anchorClass: string;
    /** Each attribute, in source order. */
    parts: VariantPick[];
    /** The element the declarations style: the anchor, or a descendant. */
    targetClass: string;
    state: ElementStateName | null;
    /**
     * Hover, press, and focus interactions into this rule's value, read
     * from its second selectors. CONTRACT.md §1.3.2
     */
    aliases: Array<{
        axis: string;
        from: string | null;
        trigger: 'hover' | 'press' | 'focus';
        to: string;
    }>;
    decls: RawDeclaration[];
    /** Verbatim, for when the axis isn't one the props type declares. */
    raw: RawSelectorBlock;
};
/**
 * Read an axis rule's selector: the root's attribute, then optionally a
 * descendant class, with a state on whichever comes last. A state on the
 * root followed by a descendant is outside the grammar.
 */
export declare const matchAxisSelector: (selector: string) => Omit<AxisRule, "decls" | "raw"> | null;
/**
 * A variant rule with second selectors for its interactions: the first
 * is the rule; each other is the same rule with one of its values swapped
 * for the value it changes from (or dropped, for any value) and a
 * trigger's pseudo-class on the root. Null when the first isn't a variant
 * rule or another isn't such a selector. CONTRACT.md §1.3.2
 */
export declare const matchAxisSelectorList: (selector: string) => Omit<AxisRule, "decls" | "raw"> | null;
export declare const parseCssDeclarations: (css: string, breakpoints: ReadonlyArray<Breakpoint>) => ParsedCss;
export {};
