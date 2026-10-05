import type { CapturedNode } from '@shared/importCapture';
/** What a node is to the table it sits in. Cell CONTENTS have no role. */
export type TableRole = 'table' | 'section' | 'row' | 'cell' | 'caption' | 'column';
export type TablePlan = {
    /** Column widths in px, measured from where the cells start. */
    columns: number[];
    /** Every structural node of this table, by captured node id. */
    roles: Map<number, TableRole>;
};
export type TableTranslation = {
    ok: true;
    plan: TablePlan;
} | {
    ok: false;
    reason: string;
};
/** Displays a browser lays out as a table. Anything else was restyled. */
export declare const TABLE_DISPLAYS: ReadonlySet<string>;
/**
 * Plan the grid for one captured table, or say why it can't be one.
 *
 * Columns are read from cell EDGES rather than cell widths: column `i`
 * runs from where its first cell starts to where column `i + 1`'s does.
 * Widths alone double-count a collapsed border (each cell reports the
 * half it owns) and miss `border-spacing`, and neither is a column.
 *
 * Refused, rather than approximated badly:
 * - a `rowspan`, which a subgrid row cannot express — each `<tr>` is one
 *   row of the table's grid, and a cell cannot reach into the next one;
 * - anything but sections, rows, a caption and column groups inside the
 *   table, or anything but cells inside a row;
 * - a column no cell starts in, whose edge was therefore never measured.
 */
export declare const planTable: (table: CapturedNode) => TableTranslation;
