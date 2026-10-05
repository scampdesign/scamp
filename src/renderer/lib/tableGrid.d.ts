import type { ScampElement } from './element';
/**
 * Is this element a table whose columns are defined?
 *
 * All three conditions matter. Without tracks, `display: grid` gives the
 * table a single implicit column and every cell stacks in it — worse than
 * the browser's own table layout, which is what an undefined table should
 * keep.
 */
export declare const isGridTable: (el: ScampElement) => boolean;
/** The three declarations that make a box a full-width subgrid row. */
export declare const TABLE_SUBGRID_DECLARATIONS: ReadonlyArray<string>;
/**
 * The derived rule that carries a grid table's columns to its rows.
 *
 * Two things about this selector are load-bearing, both measured in
 * Chromium rather than reasoned about:
 *
 * 1. **The children are matched by TAG, not by their Scamp class.** An
 *    exported page is read by the HTML parser, which inserts a `<tbody>`
 *    of its own around any `<tr>` written directly inside a `<table>`.
 *    That element carries no Scamp class, so a per-class rule misses it,
 *    the subgrid chain is cut, and every cell stacks in column one — in
 *    the exported page only, while the canvas (built through the DOM
 *    API, which inserts nothing) renders it correctly. Matching `tbody`
 *    covers the inserted element and the authored one identically.
 *
 * 2. **Everything is wrapped in `:where()`, so the rule has zero
 *    specificity.** It sits above each row's own `.rect_…` rule in the
 *    file, so at zero specificity anything a user sets on a row wins and
 *    this only fills in what they did not — the same contract the canvas
 *    tag reset holds to.
 *    see docs/notes/canvas-tag-reset-specificity.md
 *
 * `tr` is a descendant, not a child: it normally sits inside a section.
 */
export declare const tableSubgridRule: (className: string) => string;
/**
 * Tags that place their own children, so Scamp must not take those
 * children out of flow.
 *
 * `table` places its rows and `tr` places its cells — natively, or
 * through the subgrid `tableSubgridRule` derives. Either way an
 * absolutely positioned child is placed by nothing.
 *
 * `caption`, `th` and `td` are absent: those hold content, and a box
 * drawn inside a cell should still be positioned the way a box drawn
 * inside a `<div>` is.
 */
export declare const TABLE_LAYOUT_TAGS: ReadonlySet<string>;
/**
 * Does the column own this element's width?
 *
 * True for a cell inside a table whose columns are defined. It is the
 * one rule that makes single-source columns hold: a width on the cell
 * would recreate exactly the per-row duplication tables exist to
 * remove, and the two would then disagree the moment either changed.
 *
 * Walks to the nearest `table` ancestor rather than checking the direct
 * parent, because a cell's parent is a `tr` and the columns live two or
 * three levels up.
 */
export declare const columnOwnsWidth: (el: ScampElement, elements: Record<string, ScampElement>) => boolean;
/**
 * A cell's grid placement, derived from its `colSpan` / `rowSpan`.
 *
 * `colspan` is the semantic statement and `grid-column: span n` is how
 * it gets honoured once the table lays out as a grid, so the second is
 * computed from the first rather than stored beside it — two fields
 * saying the same thing is what goes out of step.
 *
 * Returns nothing for a span of 1 or less, or a value that is not a
 * whole number: `span 1` is the default and a malformed attribute is
 * better left alone than turned into a placement nobody asked for.
 */
export declare const cellSpanPlacement: (el: Pick<ScampElement, "tag" | "attributes">) => {
    gridColumn?: string;
    gridRow?: string;
};
