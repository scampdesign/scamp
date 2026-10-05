import { TABLE_LAYOUT_TAGS } from './tableGrid';
/**
 * The display an element actually lays its children out with.
 *
 * Scamp's typed `display` knows `flex`, `grid`, and a sentinel for
 * "neither". `inline-flex` and `inline-grid` are neither in the typed
 * sense, so they land in `customProperties` verbatim — which renders
 * correctly, but leaves every rule that asks "is this a layout parent?"
 * answering no. Those children then get Scamp's tree-shape default of
 * `position: absolute`, drop out of flow, and the flex box collapses to
 * nothing around them: an icon-and-label link measured 76x0.
 *
 * So the question "does this element lay out its children?" has to read
 * both. The answer is the typed keyword, because that is what the rest
 * of the model is written in; the `inline-` part still reaches the page
 * through `customProperties`.
 *
 * A table tag is the same problem arriving from the other direction. A
 * `<tr>` places its cells and a `<table>` places its rows — natively, or
 * through the subgrid a defined table derives — but the typed `display`
 * on one is the "neither" sentinel, so every caller answered no and
 * Scamp absolutely positioned the cells. An out-of-flow grid item is
 * placed by nothing, so the columns reached no cell at all.
 * see docs/plans/tables-plan.md
 */
export const effectiveDisplay = (el) => {
    if (!el)
        return undefined;
    const custom = el.customProperties['display'];
    if (custom === 'inline-flex')
        return 'flex';
    if (custom === 'inline-grid')
        return 'grid';
    // Only while the element has no opinion of its own: a row a user
    // deliberately made a flex row still is one.
    if (el.display === 'none' && el.tag !== undefined && TABLE_LAYOUT_TAGS.has(el.tag)) {
        return 'grid';
    }
    return el.display;
};
