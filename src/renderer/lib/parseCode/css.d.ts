import { type ElementStateName, type KeyframesBlock, type PropertyGroup, type RawSelectorBlock, type TableStyle } from "../element";
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
};
export declare const parseCssDeclarations: (css: string, breakpoints: ReadonlyArray<Breakpoint>) => ParsedCss;
export {};
