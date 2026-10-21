import { type ScampElement, type VariantAxis, type VariantInteraction, type VariantPick, type VariantTrigger } from './element';
/**
 * Variant interactions, CONTRACT.md §1.3.2: a component changes one
 * axis's value on hover, press, focus, a click, a click outside, or
 * Escape. Pure. see docs/plans/component-variants-plan.md, phase 7
 */
type Elements = Record<string, ScampElement>;
/** The triggers CSS expresses, and the pseudo-class each puts on the root. */
export declare const TRIGGER_PSEUDO: Readonly<Record<'hover' | 'press' | 'focus', string>>;
export declare const isCssTrigger: (trigger: VariantTrigger) => trigger is "hover" | "press" | "focus";
export declare const TRIGGER_LABEL: Readonly<Record<VariantTrigger, string>>;
export declare const interactionsOf: (elements: Elements) => ReadonlyArray<VariantInteraction>;
/**
 * The second selectors a variant rule gains, one per CSS interaction
 * whose `to` is one of its values: that value swapped for `from`, or for
 * any value (`[data-state]`, which keeps the selector as specific as the
 * other values' rules it has to beat), with the trigger's pseudo-class on
 * the root.
 * `rest` is everything after the root's attributes (` .label_c1a1:hover`).
 */
export declare const aliasSelectors: (rootClass: string, parts: ReadonlyArray<VariantPick>, rest: string, interactions: ReadonlyArray<VariantInteraction>) => string[];
/**
 * The elements as the TSX writes them: each remembered interaction as a
 * `data-scamp-*` attribute, click on its target (the root by default),
 * outside and Escape on the root.
 */
export declare const withInteractionAttributes: (elements: Elements) => Elements;
/**
 * Take the `data-scamp-*` attributes off the elements and back into
 * interactions. A malformed one stays as an ordinary attribute, verbatim.
 */
export declare const readInteractionAttributes: (elements: Elements) => {
    elements: Elements;
    interactions: VariantInteraction[];
};
/** Why an interaction can't be added, or null. */
export declare const interactionError: (axes: ReadonlyArray<VariantAxis>, i: VariantInteraction) => string | null;
export declare const addVariantInteraction: (elements: Elements, i: VariantInteraction) => Elements;
export declare const removeVariantInteraction: (elements: Elements, i: VariantInteraction) => Elements;
/**
 * Keep interactions in step with an axis edit: rename a value or an
 * axis, or drop the ones that name a removed value or axis.
 */
export declare const mapInteractions: (elements: Elements, fn: (i: VariantInteraction) => VariantInteraction | null) => Elements;
export {};
