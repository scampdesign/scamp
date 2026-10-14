/**
 * What a canvas resize handle changes. A side handle sizes one axis and
 * leaves the other's mode alone (a text box that hugs its height keeps
 * hugging); a corner sizes both. `x` / `y` move only when the handle is
 * on the left / top edge. see docs/archive/2026-10-14-text-resize-height-plan.md
 */
export type ResizeAxes = {
    x: boolean;
    y: boolean;
    width: boolean;
    height: boolean;
};
export declare const ALL_RESIZE_AXES: ResizeAxes;
/** The axes a handle (`n`, `se`, `w`, …) moves. */
export declare const axesForHandle: (handle: string) => ResizeAxes;
