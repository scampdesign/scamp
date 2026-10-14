import type { ScampElement } from './element';
import { TABLE_LAYOUT_TAGS } from './tableGrid';

/**
 * The display an element actually lays its children out with.
 *
 * Mostly the typed `display`: `inline-flex` and `inline-grid` are typed
 * as flex and grid, with their `inline` half in `displayOuter`, so they
 * answer as layout parents. (They used to sit in `customProperties`,
 * where this function had to read them; otherwise their children got
 * `position: absolute` and an icon-and-label link measured 76x0.)
 *
 * A table tag is the same problem arriving from the other direction. A
 * `<tr>` places its cells and a `<table>` places its rows — natively, or
 * through the subgrid a defined table derives — but the typed `display`
 * on one is the "neither" sentinel, so every caller answered no and
 * Scamp absolutely positioned the cells. An out-of-flow grid item is
 * placed by nothing, so the columns reached no cell at all.
 * see docs/archive/2026-10-05-tables-plan.md
 */
export const effectiveDisplay = (
  el:
    | Pick<ScampElement, 'display' | 'tag'>
    | null
    | undefined
): ScampElement['display'] | undefined => {
  if (!el) return undefined;
  // Only while the element has no opinion of its own: a row a user
  // deliberately made a flex row still is one.
  if (el.display === 'none' && el.tag !== undefined && TABLE_LAYOUT_TAGS.has(el.tag)) {
    return 'grid';
  }
  return el.display;
};
