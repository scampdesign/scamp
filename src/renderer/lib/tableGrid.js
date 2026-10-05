// @lib/tableGrid.ts — a table's columns, defined once.
//
// A Scamp table is a CSS grid whose column tracks live on the `<table>`
// element and nowhere else. Every level between the table and its cells
// — `thead` / `tbody` / `tfoot`, then `tr` — is a `subgrid` spanning all
// of those tracks, which is what carries one column definition down to
// the header row and every body row alike.
//
// Those subgrid declarations are DERIVED, not stored: writing them onto
// each row is the duplication this exists to remove.
// see docs/plans/tables-plan.md
/**
 * Is this element a table whose columns are defined?
 *
 * All three conditions matter. Without tracks, `display: grid` gives the
 * table a single implicit column and every cell stacks in it — worse than
 * the browser's own table layout, which is what an undefined table should
 * keep.
 */
export const isGridTable = (el) => el.tag === 'table' &&
    el.display === 'grid' &&
    el.gridTemplateColumns.trim().length > 0;
/** The three declarations that make a box a full-width subgrid row. */
export const TABLE_SUBGRID_DECLARATIONS = [
    'display: grid;',
    'grid-template-columns: subgrid;',
    'grid-column: 1 / -1;',
];
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
export const tableSubgridRule = (className) => {
    const body = TABLE_SUBGRID_DECLARATIONS.map((line) => `  ${line}`).join('\n');
    return (`:where(.${className}) > :where(thead, tbody, tfoot),\n` +
        `:where(.${className}) :where(tr) {\n${body}\n}`);
};
/**
 * The derived rule that stretches a caption across every column.
 *
 * A caption is a direct grid item of the table. Without this it lands in
 * column one and wraps to that column's width — the whole title squeezed
 * into the first cell's space.
 */
export const tableCaptionRule = (className) => `:where(.${className}) > :where(caption) {\n  grid-column: 1 / -1;\n}`;
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
export const TABLE_LAYOUT_TAGS = new Set([
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
]);
/** Cell tags — the leaves a table's columns actually size. */
const TABLE_CELL_TAGS = new Set(['th', 'td']);
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
export const columnOwnsWidth = (el, elements) => {
    if (el.tag === undefined || !TABLE_CELL_TAGS.has(el.tag))
        return false;
    let parentId = el.parentId;
    // Bounded by the tree's own depth; a malformed cycle would otherwise
    // spin here, and this runs on every properties-panel render.
    const seen = new Set();
    while (parentId !== null && !seen.has(parentId)) {
        seen.add(parentId);
        const ancestor = elements[parentId];
        if (!ancestor)
            return false;
        if (ancestor.tag === 'table')
            return isGridTable(ancestor);
        parentId = ancestor.parentId;
    }
    return false;
};
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
export const cellSpanPlacement = (el) => {
    if (el.tag === undefined || !TABLE_CELL_TAGS.has(el.tag))
        return {};
    const span = (name) => {
        const raw = el.attributes?.[name];
        if (raw === undefined)
            return undefined;
        const n = Number(raw.trim());
        if (!Number.isInteger(n) || n < 2 || n > 1000)
            return undefined;
        return `span ${n}`;
    };
    const gridColumn = span('colSpan');
    const gridRow = span('rowSpan');
    return {
        ...(gridColumn !== undefined ? { gridColumn } : {}),
        ...(gridRow !== undefined ? { gridRow } : {}),
    };
};
