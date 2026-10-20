import { type BreakpointOverride, type ScampElement, type VariantAxis } from './element';
/** Fields that only paint: they change how an element looks, not where anything goes. */
export declare const PAINT_FIELDS: readonly ["backgroundColor", "borderColor", "color", "opacity", "fontWeight", "fill", "stroke", "boxShadows", "boxShadowToken"];
export declare const PAINT_CSS: ReadonlySet<string>;
/** More looks than this is a component styled per page, not a set of variants. */
export declare const MAX_VARIANT_VALUES = 4;
/** One copy of the component: where it was, what React passed it, its elements by position. */
export type VariantCopy = {
    view: string;
    props: Readonly<Record<string, string | number | boolean>>;
    elements: ReadonlyArray<ScampElement | undefined>;
};
export type ReactVariantPlan = {
    kind: 'variants';
    axis: VariantAxis;
    /** Each copy's value, in copy order. */
    copyValues: string[];
    /** Each non-default value's override at each position that differs. */
    overrides: Record<string, Record<number, BreakpointOverride>>;
    /** Where the names came from. */
    named: 'prop' | 'view' | 'number';
}
/** Too many looks to be variants; the component keeps its commonest look. */
 | {
    kind: 'too-many';
    looks: number;
};
/**
 * What `el` paints differently from `look`. A paint the look has and the
 * copy lacks can't be unset by an override, so it isn't carried.
 */
export declare const paintOverride: (el: ScampElement, look: ScampElement) => BreakpointOverride;
/** A string as a variant value: lowercase words joined by hyphens. */
export declare const slugValue: (raw: string) => string;
/**
 * Plan the variants a component's copies need, given the common look at
 * each position. Null when no copy paints differently from it.
 */
export declare const planReactVariants: (copies: ReadonlyArray<VariantCopy>, look: ReadonlyArray<ScampElement>, 
/** Prop names the component already has, such as its text props. */
takenProps?: ReadonlySet<string>) => ReactVariantPlan | null;
