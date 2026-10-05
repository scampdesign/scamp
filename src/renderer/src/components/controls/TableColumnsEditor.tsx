import { IconColumns } from '@tabler/icons-react';

import { makeFrTracks, serializeGridTemplate } from '@lib/gridTemplate';
import type { ScampElement } from '@lib/element';

import { GridTrackList } from './GridTrackList';
import styles from './TableColumnsEditor.module.css';

type Props = {
  /** The `<table>` element being edited. */
  table: ScampElement;
  /** Every element on the page, to count the cells in the first row. */
  elements: Record<string, ScampElement>;
  onChange: (patch: {
    display?: ScampElement['display'];
    gridTemplateColumns?: string;
  }) => void;
};

/**
 * A table's columns, defined once.
 *
 * The generic grid editor offers a Rows axis too, which a table has no
 * use for — its rows are `<tr>` elements, and they are added by drawing
 * one, not by editing a track list. This writes `grid-template-columns`
 * on the table and nothing else; every row picks the tracks up through
 * the subgrid rule the generator derives.
 * see docs/plans/tables-plan.md
 */

/** How many cells the table's first row holds, or 0 if it has no rows. */
const firstRowCellCount = (
  table: ScampElement,
  elements: Record<string, ScampElement>
): number => {
  const rowTagged = (el: ScampElement): boolean => el.tag === 'tr';
  const walk = (el: ScampElement): ScampElement | null => {
    for (const childId of el.childIds) {
      const child = elements[childId];
      if (!child) continue;
      if (rowTagged(child)) return child;
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  const row = walk(table);
  return row ? row.childIds.length : 0;
};

export const TableColumnsEditor = ({
  table,
  elements,
  onChange,
}: Props): JSX.Element => {
  const defined =
    table.display === 'grid' && table.gridTemplateColumns.trim().length > 0;

  if (!defined) {
    // Seeded from the row that already exists, because that count is
    // almost always the answer and picking it again by hand is busywork.
    // Three is the fallback when there is no row to read yet.
    const seed = firstRowCellCount(table, elements) || 3;
    return (
      <div className={styles.editor}>
        <p className={styles.hint}>
          A table's column widths live here, so a change moves the header
          and the body together.
        </p>
        <button
          type="button"
          className={styles.define}
          onClick={() =>
            onChange({
              display: 'grid',
              gridTemplateColumns: serializeGridTemplate(makeFrTracks(seed)),
            })
          }
          title="Define this table's columns"
        >
          <IconColumns size={13} stroke={1.75} />
          Define {seed} columns
        </button>
      </div>
    );
  }

  return (
    <div className={styles.editor}>
      <GridTrackList
        label="Columns"
        template={table.gridTemplateColumns}
        onChange={(next) => onChange({ gridTemplateColumns: next })}
      />
      <p className={styles.hint}>
        Every row follows these tracks. Cells take their width from the
        column they sit in.
      </p>
    </div>
  );
};
