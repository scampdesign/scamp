import type { ScampElement } from '@lib/element';
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type SelectedRect = {
    x: number;
    y: number;
    w: number;
    h: number;
};
export type DrawState = {
    parentId: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    parentOffsetX: number;
    parentOffsetY: number;
    slotName?: string;
};
export type MoveState = {
    id: string;
    pointerStartX: number;
    pointerStartY: number;
    originX: number;
    originY: number;
    /**
     * Frame-local offset of the cursor within the dragged element at grab
     * time. Used to preserve the grab point when reparenting into another
     * container so the element doesn't jump under the cursor on drop.
     */
    grabDX: number;
    grabDY: number;
};
export type ResizeState = {
    id: string;
    handle: ResizeHandle;
    pointerStartX: number;
    pointerStartY: number;
    originX: number;
    originY: number;
    originW: number;
    originH: number;
};
/**
 * Pointer state used when dragging a flex child to a new position in its
 * parent's flex flow. Position is owned by the layout engine, not by x/y,
 * so the only meaningful drag operation is reordering siblings.
 */
export type ReorderState = {
    id: string;
    parentId: string;
    /** Pointer position at grab time, for the click-slop gate. */
    pointerStartX: number;
    pointerStartY: number;
    /**
     * Frame-local offset of the cursor within the dragged child at grab
     * time — used to place the element under the cursor if it's dropped
     * out into an absolute container.
     */
    grabDX: number;
    grabDY: number;
};
export type DropIndicator = {
    /** Frame-local rect to draw the drop line. */
    rect: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    /** The childIds index the drop will resolve to on release. */
    newIndex: number;
    /**
     * Frame-local rect of the container the drop lands IN. Drawn as an
     * outline alongside the line: the line says where among the siblings,
     * and this says whose siblings they are — without it a line floating
     * between two boxes doesn't tell you which container you just joined.
     * see docs/archive/2026-08-13-drop-placement-helpers-plan.md
     */
    containerRect: {
        x: number;
        y: number;
        w: number;
        h: number;
    } | null;
};
/**
 * A pending cross-parent reparent computed during a drag. Two shapes by
 * the target container's layout:
 *   - `flow` (flex/grid): insert at `indicator.newIndex`; the gap line
 *     (`indicator.rect`) shows where it lands.
 *   - `absolute`: reparent and place the element at `x`/`y` in the
 *     container's local space; the container outline (`rect`) highlights.
 * Shared by the move (absolute element) and reorder (flex child) drag
 * paths via `reparentDrop.ts`.
 * see docs/plans/canvas-drag-reparent-plan.md
 */
export type ReparentDrop = {
    kind: 'flow';
    targetId: string;
    indicator: DropIndicator;
} | {
    kind: 'absolute';
    targetId: string;
    rect: SelectedRect;
    x: number;
    y: number;
    /** Set when the target is a component-instance slot — the reparented
     *  element becomes that slot's content. see
     *  docs/archive/2026-07-16-component-slots-plan.md */
    slotName?: string;
};
/**
 * Geometry helpers shared by every interaction hook, bound to the current
 * frame + scale + element tree. Produced by `useCanvasGeometry`.
 */
export type CanvasGeometry = {
    /** Convert viewport pointer coords to frame-local (logical) coords. */
    toFrame: (clientX: number, clientY: number) => {
        x: number;
        y: number;
    };
    /** Measure an element's bounding box in frame-local logical coords. */
    measureElementInFrame: (id: string) => SelectedRect | null;
    /** Parent inner-bounds size for clamping at the end of a draw. */
    parentSizeOf: (parentId: string | null) => {
        w: number;
        h: number;
    };
    /** Parent's current visible extent for clamping move / resize. */
    parentMoveBoundsOf: (parentId: string | null) => {
        w: number;
        h: number;
    };
    /** True if `el`'s parent is a flex container. */
    isFlexChild: (el: ScampElement | undefined) => boolean;
    /** Flex OR grid child — the parent owns placement, so a drag reorders. */
    isFlowChild: (el: ScampElement | undefined) => boolean;
    /**
     * Resolve the deepest container under the cursor that `draggedId`
     * could reparent into. Skips the dragged element + its subtree and
     * non-container leaves (text / input / image / component-instance).
     * `isFlow` is true for flex/grid (insert-index drop) vs absolute
     * (x/y drop). Null when there's no valid container under the cursor.
     * see docs/plans/canvas-drag-reparent-plan.md
     */
    resolveDropContainer: (clientX: number, clientY: number, draggedId: string) => {
        parentId: string;
        isFlow: boolean;
        /** Set when the target is a component-instance slot (drop into the
         *  instance's slot content). Slot drops bypass sibling-exclusion. */
        slotName?: string;
    } | null;
};
