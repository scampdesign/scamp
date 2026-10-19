import { type BreakpointOverride, type ElementStateName, type ScampElement, type VariantAxis } from './element';
/**
 * Edits to a component's variant axes: the root's `variantAxes`, the
 * `data-<prop>` binding that carries each one, and the overrides keyed by
 * its values on every element. CONTRACT.md §1.3.1, and
 * docs/plans/component-variants-plan.md
 */
type Elements = Record<string, ScampElement>;
export declare const axesOf: (elements: Elements) => ReadonlyArray<VariantAxis>;
export declare const parseVariantKey: (key: string) => {
    axis: string;
    value: string;
} | null;
/** True when `key` names a non-default value of a declared axis. */
export declare const isVariantKeyLive: (elements: Elements, key: string) => boolean;
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
export {};
