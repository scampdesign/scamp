import { useCanvasStore } from '@store/canvasSlice';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { elementIdOf } from './canvasHitTest';
/**
 * Builds the frame-local geometry helpers the interaction hooks share:
 * coordinate conversion, DOM measurement, and the parent-bounds lookups
 * used to clamp draw / move / resize. Bound to the current frame element,
 * render scale, and element tree.
 *
 * The frame is rendered via `transform: scale`, which has well-defined,
 * platform-consistent behavior: `getBoundingClientRect()` returns the
 * visible (scaled) rect while `offsetWidth/Left` stay in logical pixels.
 */
export const useCanvasGeometry = (frameRef, scale) => {
    const elements = useCanvasStore((s) => s.elements);
    const toFrame = (clientX, clientY) => {
        const frame = frameRef.current;
        if (!frame)
            return { x: 0, y: 0 };
        const rect = frame.getBoundingClientRect();
        return {
            x: (clientX - rect.left) / scale,
            y: (clientY - rect.top) / scale,
        };
    };
    /**
     * Measure an element's bounding box in frame-local (logical)
     * coordinates by querying the rendered DOM. Source of truth for the
     * selection overlay and the draw-tool parent offset.
     *
     * The frame is scaled with `transform: scale`, which doesn't touch
     * layout — so `offsetLeft/offsetTop/offsetWidth/offsetHeight` are
     * already in logical pixels and don't need to be divided by scale.
     */
    const measureElementInFrame = (id) => {
        const frame = frameRef.current;
        if (!frame)
            return null;
        const node = frame.querySelector(`[data-element-id="${id}"]`);
        if (!(node instanceof HTMLElement))
            return null;
        // Walk up the offsetParent chain to the frame, accumulating logical
        // pixel offsets. offsetLeft/Top are always unaffected by ancestor
        // `transform: scale` since transforms don't reflow layout.
        let x = 0;
        let y = 0;
        let current = node;
        while (current && current !== frame) {
            x += current.offsetLeft;
            y += current.offsetTop;
            current = current.offsetParent;
        }
        // A component-instance wrapper is structurally 0-sized on at least one
        // axis: the component renders with absolute positioning, so its content
        // never sizes the wrapper. Measuring the wrapper directly gives a 0-size
        // box, so the selection outline/overlay collapses to nothing. Fall back to
        // the bounding box of the rendered content so the selection frames what the
        // user actually sees. see docs/notes/components-data-model.md
        if (node.dataset['scampInstanceId'] &&
            (node.offsetWidth === 0 || node.offsetHeight === 0)) {
            const frameRect = frame.getBoundingClientRect();
            const scale = frame.offsetWidth > 0 ? frameRect.width / frame.offsetWidth : 1;
            let minL = Infinity;
            let minT = Infinity;
            let maxR = -Infinity;
            let maxB = -Infinity;
            for (const desc of node.querySelectorAll('*')) {
                const r = desc.getBoundingClientRect();
                if (r.width === 0 && r.height === 0)
                    continue;
                minL = Math.min(minL, r.left);
                minT = Math.min(minT, r.top);
                maxR = Math.max(maxR, r.right);
                maxB = Math.max(maxB, r.bottom);
            }
            if (minL !== Infinity) {
                return {
                    x: Math.round((minL - frameRect.left) / scale),
                    y: Math.round((minT - frameRect.top) / scale),
                    w: Math.round((maxR - minL) / scale),
                    h: Math.round((maxB - minT) / scale),
                };
            }
        }
        return {
            x,
            y,
            w: node.offsetWidth,
            h: node.offsetHeight,
        };
    };
    /**
     * Look up a parent element's inner-bounds size for clamping at the
     * end of a draw. For non-root rects the stored
     * widthValue/heightValue is authoritative. For the root, stored
     * values are stale (root defaults to stretch/auto), so width comes
     * from the DOM and height is treated as unbounded — a user should
     * be able to draw a rectangle below the current content extent and
     * have the page grow to accommodate it.
     */
    const parentSizeOf = (parentId) => {
        const id = parentId ?? ROOT_ELEMENT_ID;
        if (id === ROOT_ELEMENT_ID) {
            const measured = measureElementInFrame(ROOT_ELEMENT_ID);
            const rootWidth = measured?.w ?? elements[ROOT_ELEMENT_ID]?.widthValue ?? 1440;
            return { w: rootWidth, h: Number.POSITIVE_INFINITY };
        }
        const el = elements[id];
        if (!el)
            return { w: Number.POSITIVE_INFINITY, h: Number.POSITIVE_INFINITY };
        // MEASURE the parent; do not read `widthValue` / `heightValue` off the
        // model. Those numbers are only meaningful when the axis is `fixed`.
        // For `stretch`, `fit-content` or `auto` they are an untouched
        // fallback — 100 — with no relation to the rendered box.
        //
        // That is not a rounding error, it is a wrong answer by an order of
        // magnitude: a `width: 100%` container 1440px wide reported 100, so a
        // rectangle drawn inside it was clamped to 100px wide while its height
        // clamped correctly against a real fixed height and survived. Correct
        // height, absurd width, and only in containers sized by their layout.
        // see docs/notes/draw-into-flex-parent.md
        const measured = measureElementInFrame(id);
        return {
            w: measured?.w ?? el.widthValue,
            h: measured?.h ?? el.heightValue,
        };
    };
    /**
     * Bounds for clamping move / resize operations. Unlike
     * `parentSizeOf` (which treats root height as unbounded so draws
     * can extend the page), move and resize clamp against the parent's
     * CURRENT visible extent — otherwise the user can drag an element
     * completely off the bottom of the page with no way to get it back.
     *
     * For root we use the canvas frame's rendered height rather than
     * root's own offsetHeight: root defaults to `height: auto` and its
     * children are `position: absolute`, which contribute nothing to
     * the CSS content-driven height — root would measure as zero and
     * every move would be locked at y=0.
     */
    const parentMoveBoundsOf = (parentId) => {
        const id = parentId ?? ROOT_ELEMENT_ID;
        if (id === ROOT_ELEMENT_ID) {
            const frame = frameRef.current;
            const measured = measureElementInFrame(ROOT_ELEMENT_ID);
            const el = elements[ROOT_ELEMENT_ID];
            return {
                w: measured?.w ?? el?.widthValue ?? 1440,
                h: frame?.offsetHeight ?? el?.heightValue ?? 900,
            };
        }
        const el = elements[id];
        if (!el)
            return { w: Number.POSITIVE_INFINITY, h: Number.POSITIVE_INFINITY };
        return { w: el.widthValue, h: el.heightValue };
    };
    /** True if `el`'s parent is a flex container — i.e. flex layout owns its position. */
    const isFlexChild = (el) => {
        if (!el || !el.parentId)
            return false;
        return elements[el.parentId]?.display === 'flex';
    };
    /**
     * Is this element laid out by its parent's flow — flex OR grid?
     *
     * Distinct from `isFlexChild`, which stays flex-only for the
     * resize-handle rule (a grid item can still be given its own size).
     * This one decides whether a drag is a *reorder*: in both flex and grid
     * the parent owns placement, so dragging a child means changing its
     * position in the sibling order, not its x/y. Grid children used to
     * fall through to the absolute-move path, where dragging them did
     * nothing visible and the only drop feedback came from whichever
     * sibling happened to be under the cursor.
     * see docs/archive/2026-08-13-drop-placement-helpers-plan.md
     */
    const isFlowChild = (el) => {
        if (!el || !el.parentId)
            return false;
        const display = elements[el.parentId]?.display;
        return display === 'flex' || display === 'grid';
    };
    /** True if `id` is `ancestorId` or anywhere below it in the tree. */
    const isSelfOrDescendant = (id, ancestorId) => {
        let cursor = id;
        while (cursor) {
            if (cursor === ancestorId)
                return true;
            cursor = elements[cursor]?.parentId ?? null;
        }
        return false;
    };
    const resolveDropContainer = (clientX, clientY, draggedId) => {
        // elementsFromPoint is top→bottom in paint order, so the first
        // container we hit walking outward is the deepest one under the
        // cursor. The chrome layer has no `data-element-id`, so it's
        // skipped naturally.
        const candidates = document.elementsFromPoint(clientX, clientY);
        for (const node of candidates) {
            // Component slot drop zone: route the drop into the owning instance
            // (the dropped element becomes page-owned slot content). The zone
            // carries `data-scamp-slot` + `data-slot-owner-id` (the instance's
            // canvas id). see docs/archive/2026-07-16-component-slots-plan.md
            if (node instanceof HTMLElement && node.dataset['scampSlot']) {
                const ownerId = node.dataset['slotOwnerId'];
                if (ownerId &&
                    elements[ownerId] &&
                    !isSelfOrDescendant(ownerId, draggedId)) {
                    return {
                        parentId: ownerId,
                        isFlow: false,
                        slotName: node.dataset['scampSlot'],
                    };
                }
            }
            const id = elementIdOf(node);
            if (!id)
                continue;
            // Never drop into the dragged element or its own subtree.
            if (isSelfOrDescendant(id, draggedId))
                continue;
            const el = elements[id];
            if (!el)
                continue;
            // Only rectangles hold children; text / image / input are leaves.
            // A component-instance is only droppable via its slot zones (above).
            if (el.type !== 'rectangle')
                continue;
            const isFlow = el.display === 'flex' || el.display === 'grid';
            return { parentId: id, isFlow };
        }
        return null;
    };
    return {
        toFrame,
        measureElementInFrame,
        parentSizeOf,
        parentMoveBoundsOf,
        isFlexChild,
        isFlowChild,
        resolveDropContainer,
    };
};
