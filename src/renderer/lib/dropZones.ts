/**
 * Where a drop lands relative to the element under the cursor.
 *
 * The one definition both drag surfaces consult, so the canvas and the
 * layers tree can't disagree about what the cursor position means. Pure
 * and axis-agnostic: the tree always splits vertically, a flex-row
 * container splits horizontally, and both hand in the same shape.
 * see docs/archive/2026-08-13-drop-placement-helpers-plan.md
 */

export type DropZone = 'before' | 'inside' | 'after';

/**
 * How far into an element the "drop beside it" band reaches.
 *
 * A flat 25% is wrong at both ends: 25% of a 24px tree row is a 6px
 * target nobody can hit, and 25% of an 800px container is a 200px band
 * that swallows the middle. Clamping keeps small elements usable and
 * large ones mostly "inside".
 */
export const EDGE_BAND_RATIO = 0.25;
export const MIN_EDGE_BAND = 6;
export const MAX_EDGE_BAND = 16;

/** The edge band for an element of `size` px along the drop axis. */
export const edgeBandFor = (size: number): number =>
  Math.min(MAX_EDGE_BAND, Math.max(MIN_EDGE_BAND, size * EDGE_BAND_RATIO));

export type DropZoneInput = {
  /** The element's extent along the drop axis, in any consistent unit. */
  rect: { start: number; size: number };
  /** Cursor position on the same axis, same origin as `rect.start`. */
  cursor: number;
  /** False for leaves (text / image / input / instance) — they never
   *  return `inside`, since a child of an `<img>` isn't a thing. */
  canHoldChildren: boolean;
};

/**
 * Resolve the cursor's position over an element into before / inside /
 * after.
 *
 * Boundaries resolve deterministically (a cursor exactly on one belongs
 * to the middle zone), so a pixel of jitter can't flicker the indicator
 * between two answers.
 */
export const resolveDropZone = ({
  rect,
  cursor,
  canHoldChildren,
}: DropZoneInput): DropZone => {
  const { start, size } = rect;
  const offset = cursor - start;

  // Degenerate box — nothing to divide, so just pick a side.
  if (!(size > 0)) return offset < 0 ? 'before' : 'after';

  const half = (): DropZone => (offset < size / 2 ? 'before' : 'after');
  if (!canHoldChildren) return half();

  // When the two bands would meet or overlap there's no middle left to
  // drop into, so a container this small behaves like a leaf rather than
  // offering an "inside" zone a pixel wide.
  const band = edgeBandFor(size);
  if (band * 2 >= size) return half();

  if (offset < band) return 'before';
  if (offset > size - band) return 'after';
  return 'inside';
};
