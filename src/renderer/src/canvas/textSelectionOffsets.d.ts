/**
 * A DOM selection inside a text element, as offsets over its joined
 * text.
 *
 * Offsets, not nodes, because that is what the run operations take:
 * `applyStyleToRange` and `styleOfRange` count characters across the
 * whole sentence, and a caller holding a `Range` has no way to convert
 * one to the other. A styled sentence renders as several spans, so the
 * selection routinely starts in one text node and ends in another.
 * see docs/plans/inline-spans-plan.md
 */
export type TextOffsets = {
    start: number;
    end: number;
};
/**
 * The selected range inside `host`, or null when there is no range to
 * style.
 *
 * Null for a collapsed caret on purpose: styling nothing is not an
 * operation, and a panel that acted on a caret would restyle whatever
 * the user last selected the moment they clicked away.
 */
export declare const selectionOffsetsWithin: (host: HTMLElement, selection: Selection | null) => TextOffsets | null;
