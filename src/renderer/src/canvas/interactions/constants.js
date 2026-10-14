// Default sizes + thresholds for the canvas draw / drop tools.
/** Default size for image elements placed via click (not drag). */
export const DEFAULT_IMAGE_SIZE = 200;
/**
 * If the user just clicks (rather than drag-drawing) with the rectangle
 * tool, we drop a default-sized rect centered on the cursor. Anything
 * smaller than `CLICK_DRAG_THRESHOLD` on either axis counts as "click,
 * not drag".
 */
export const CLICK_DRAG_THRESHOLD = 5;
/**
 * How far the pointer must travel from pointer-down before a move or
 * reorder gesture may resolve a drop target. Without it a click's jitter
 * reorders a flex child or lifts it out of its parent.
 * see docs/notes/click-vs-drag-slop.md
 */
export const DRAG_ARM_DISTANCE = 5;
/** True once the pointer has travelled far enough to count as a drag. */
export const hasLeftClickSlop = (startX, startY, x, y) => Math.hypot(x - startX, y - startY) >= DRAG_ARM_DISTANCE;
export const DEFAULT_NEW_RECT_SIZE = 200;
/** Default size for an input element placed via click (not drag). */
export const DEFAULT_NEW_INPUT_WIDTH = 240;
export const DEFAULT_NEW_INPUT_HEIGHT = 32;
/**
 * Dropped / pasted SVGs at or under this many bytes are inlined as an
 * editable `<svg>` element (fill/stroke editable); larger ones are copied
 * into assets and referenced as `<img>` to keep the TSX lean.
 * see docs/archive/2026-06-30-svg-improvements-plan.md
 */
export const INLINE_SVG_MAX_BYTES = 12 * 1024;
