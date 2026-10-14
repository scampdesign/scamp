/**
 * What a canvas resize handle changes. A side handle sizes one axis and
 * leaves the other's mode alone (a text box that hugs its height keeps
 * hugging); a corner sizes both. `x` / `y` move only when the handle is
 * on the left / top edge. see docs/archive/2026-10-14-text-resize-height-plan.md
 */
export type ResizeAxes = { x: boolean; y: boolean; width: boolean; height: boolean };

export const ALL_RESIZE_AXES: ResizeAxes = { x: true, y: true, width: true, height: true };

/** The axes a handle (`n`, `se`, `w`, …) moves. */
export const axesForHandle = (handle: string): ResizeAxes => ({
  x: handle.includes('w'),
  y: handle.includes('n'),
  width: handle.includes('e') || handle.includes('w'),
  height: handle.includes('n') || handle.includes('s'),
});
