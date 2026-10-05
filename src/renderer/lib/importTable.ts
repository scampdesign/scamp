// @lib/importTable.ts — read a captured `<table>` as a Scamp grid table.
//
// A Scamp table is a grid whose columns live on the table and reach the
// rows through a derived subgrid rule. Importing one means finding those
// columns in what the page measured, and knowing which captured node is
// the table, a section, a row or a cell — the reducer treats each
// differently. see docs/plans/tables-plan.md

import type { CapturedNode } from '@shared/importCapture';

/** What a node is to the table it sits in. Cell CONTENTS have no role. */
export type TableRole = 'table' | 'section' | 'row' | 'cell' | 'caption' | 'column';

export type TablePlan = {
  /** Column widths in px, measured from where the cells start. */
  columns: number[];
  /** Every structural node of this table, by captured node id. */
  roles: Map<number, TableRole>;
};

export type TableTranslation =
  | { ok: true; plan: TablePlan }
  | { ok: false; reason: string };

/** Displays a browser lays out as a table. Anything else was restyled. */
export const TABLE_DISPLAYS: ReadonlySet<string> = new Set(['table', 'inline-table']);

const SECTION_TAGS: ReadonlySet<string> = new Set(['thead', 'tbody', 'tfoot']);
const CELL_TAGS: ReadonlySet<string> = new Set(['th', 'td']);
const COLUMN_TAGS: ReadonlySet<string> = new Set(['colgroup', 'col']);

/** A span attribute as a whole number of 1 or more, or 1 if absent or malformed. */
const spanOf = (node: CapturedNode, name: 'colspan' | 'rowspan'): number => {
  const raw = node.attrs[name];
  if (raw === undefined) return 1;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 1 ? n : 1;
};

const round = (n: number): number => Math.round(n * 100) / 100;

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
export const planTable = (table: CapturedNode): TableTranslation => {
  const roles = new Map<number, TableRole>([[table.id, 'table']]);
  const rows: CapturedNode[] = [];

  for (const child of table.children) {
    if (child.tag === 'tr') {
      roles.set(child.id, 'row');
      rows.push(child);
    } else if (SECTION_TAGS.has(child.tag)) {
      roles.set(child.id, 'section');
      for (const row of child.children) {
        if (row.tag !== 'tr') return { ok: false, reason: `a <${row.tag}> inside <${child.tag}>` };
        roles.set(row.id, 'row');
        rows.push(row);
      }
    } else if (child.tag === 'caption') {
      roles.set(child.id, 'caption');
    } else if (COLUMN_TAGS.has(child.tag)) {
      roles.set(child.id, 'column');
      for (const col of child.children) roles.set(col.id, 'column');
    } else {
      return { ok: false, reason: `a <${child.tag}> directly inside the table` };
    }
  }
  if (rows.length === 0) return { ok: false, reason: 'no rows' };

  const starts: number[] = [];
  const ends: number[] = [];
  let columnCount = 0;
  for (const row of rows) {
    let column = 0;
    for (const cell of row.children) {
      if (!CELL_TAGS.has(cell.tag)) return { ok: false, reason: `a <${cell.tag}> inside a row` };
      if (spanOf(cell, 'rowspan') > 1) return { ok: false, reason: 'a cell spans rows' };
      roles.set(cell.id, 'cell');
      const span = spanOf(cell, 'colspan');
      if (cell.rect !== undefined) {
        const last = column + span - 1;
        starts[column] = Math.min(starts[column] ?? Infinity, cell.rect.x);
        ends[last] = Math.max(ends[last] ?? -Infinity, cell.rect.x + cell.rect.w);
      }
      column += span;
    }
    columnCount = Math.max(columnCount, column);
  }

  const columns: number[] = [];
  for (let i = 0; i < columnCount; i += 1) {
    const start = starts[i];
    const end = i + 1 < columnCount ? starts[i + 1] : ends[i];
    if (start === undefined || end === undefined || end - start <= 0) {
      return { ok: false, reason: `column ${i + 1} has no measured edge` };
    }
    columns.push(round(end - start));
  }
  return { ok: true, plan: { columns, roles } };
};
