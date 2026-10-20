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
 * whose `to` is one of its values: that value swapped for `from` (or
 * dropped, for any value), with the trigger's pseudo-class on the root.
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
export declare const removeVariantInteraction: (elements: Elements, index: number) => Elements;
/**
 * Keep interactions in step with an axis edit: rename a value or an
 * axis, or drop the ones that name a removed value or axis.
 */
export declare const mapInteractions: (elements: Elements, fn: (i: VariantInteraction) => VariantInteraction | null) => Elements;
/** What the pointer and focus are doing to a component being tried. */
export type TryPointer = {
    hover: boolean;
    press: boolean;
    focus: boolean;
};
/**
 * The values drawn while trying a component: the values it holds, with
 * each hover, press, or focus interaction that applies on top. Press
 * after hover, as a pressed rule comes after a hover one.
 */
export declare const shownPicks: (picks: Readonly<Record<string, string>>, interactions: ReadonlyArray<VariantInteraction>, pointer: TryPointer) => Record<string, string>;
/**
 * The values a component holds after a click (on `target`, the root
 * when the click wasn't on one with its own interaction), a click
 * outside it, or Escape. What the scampjs handler does in the browser.
 */
export declare const afterTrigger: (picks: Readonly<Record<string, string>>, interactions: ReadonlyArray<VariantInteraction>, trigger: "click" | "outside" | "escape", target?: string) => Record<string, string>;
export {};
