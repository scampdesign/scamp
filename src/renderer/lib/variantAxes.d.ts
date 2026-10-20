import { type BreakpointOverride, type ElementStateName, type ScampElement, type VariantAxis } from './element';
/**
 * Edits to a component's variant axes: the root's `variantAxes`, the
 * `data-<prop>` binding that carries each one, and the overrides keyed by
 * its values on every element. CONTRACT.md §1.3.1, and
 * docs/plans/component-variants-plan.md
 */
type Elements = Record<string, ScampElement>;
/** How many combinations a component's axes may make. Decided for phase 6. */
export declare const MAX_VARIANT_COMBINATIONS = 36;
/** Every value of every axis, multiplied: the frames the set draws. */
export declare const variantCombinationCount: (axes: ReadonlyArray<VariantAxis>) => number;
/** Why adding `extra` values to an axis (or an axis of `extra` values) is refused, or null. */
export declare const combinationLimitError: (axes: ReadonlyArray<VariantAxis>, next: ReadonlyArray<VariantAxis>) => string | null;
export declare const axesOf: (elements: Elements) => ReadonlyArray<VariantAxis>;
/**
 * True when `key` names non-default values of declared axes, one per
 * axis, in axis order: a single value or a combination.
 */
export declare const isVariantKeyLive: (elements: Elements, key: string) => boolean;
/**
 * The keys an instance's props reach: each picked value, then each
 * combination of them, in the order their rules are written. The
 * default, and a value the axis lacks, pick nothing.
 */
export declare const instanceVariantKeys: (axes: ReadonlyArray<VariantAxis>, propOverrides: Readonly<Record<string, string>> | undefined) => string[];
/** Why `name` can't be a new value on `axis`, or null when it can. */
export declare const variantValueError: (axis: VariantAxis, name: string, renaming?: string | null) => string | null;
/** Why `name` can't be a new axis, or null when it can. */
export declare const variantAxisError: (elements: Elements, name: string, renaming?: string | null) => string | null;
/** A name not yet on the axis: `variant-2`, `variant-3`, … */
export declare const nextValueName: (axis: VariantAxis) => string;
/** Add an axis bound as `data-<prop>={<prop>}` on the root. */
export declare const addVariantAxis: (elements: Elements, axis: VariantAxis) => Elements;
/** Remove an axis, its binding, and every override for its values. */
export declare const removeVariantAxis: (elements: Elements, prop: string) => Elements;
export declare const renameVariantAxis: (elements: Elements, from: string, to: string) => Elements;
/**
 * Add a value. With `copyFrom`, the new value starts as a copy of that
 * value's look; without it, as the default look.
 */
export declare const addVariantValue: (elements: Elements, prop: string, value: string, copyFrom: string | null) => Elements;
export declare const renameVariantValue: (elements: Elements, prop: string, from: string, to: string) => Elements;
/** Remove a non-default value and its overrides. The default can't be removed. */
export declare const removeVariantValue: (elements: Elements, prop: string, value: string) => Elements;
/** The fields `key` (and `state` within it) overrides on `el`. */
export declare const variantOverrideFields: (el: ScampElement | undefined, key: string, state: ElementStateName | null) => Array<keyof BreakpointOverride>;
/** Drop `fields` from `el`'s override for `key` (or its `state`), pruning empty maps. */
export declare const resetVariantFields: (el: ScampElement, key: string, state: ElementStateName | null, fields: ReadonlyArray<keyof BreakpointOverride>) => ScampElement;
/** The axis picks a combination key under `axes` stands for: every axis, defaults included. */
export declare const fullPicks: (axes: ReadonlyArray<VariantAxis>, key: string | null) => Record<string, string>;
/** The key for full picks under `axes`: the values that aren't defaults, or null. */
export declare const keyFor: (axes: ReadonlyArray<VariantAxis>, picks: Readonly<Record<string, string>>) => string | null;
/**
 * Make `value` the axis's default, moved to the front of its values, as
 * Figma's top-left variant is. The base rules become that value's look,
 * and every other value and combination is rebuilt so each look is
 * unchanged: each element's look is computed for every combination and
 * state under the old default, then written back as the smallest
 * overrides under the new one.
 */
export declare const makeVariantDefault: (elements: Elements, prop: string, value: string) => Elements;
/** Move a value to `toIndex` in its axis. Value order is the grid's and the CSS's. */
export declare const moveVariantValue: (elements: Elements, prop: string, value: string, toIndex: number) => Elements;
/** One frame of the variant set: its key (null for the default look) and what it combines. */
export type VariantCell = {
    key: string | null;
    picks: Record<string, string>;
    label: string;
};
/** A grid of frames, with a heading when the component has a third axis or more. */
export type VariantBlock = {
    heading: string | null;
    rows: VariantCell[][];
};
/**
 * The variant set's layout, Figma's component set: the first axis down
 * the rows and the second across, in value order; one grid per value of
 * each further axis, stacked. Every combination is a frame.
 */
export declare const variantGrid: (axes: ReadonlyArray<VariantAxis>) => VariantBlock[];
export {};
