import { useRef, useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { useHistoryStore } from '@store/historySlice';
import { useAppLogStore } from '@store/appLogSlice';
import { hasLeftClickSlop } from './constants';
import { commitReparentDrop, resolveReparentDrop, slotDropCreatesCycle, } from './reparentDrop';
/**
 * Move state machine for absolutely-positioned elements. A history
 * transaction wraps the per-tick `moveElement` calls so the drag commits
 * as a single entry. Position is clamped to the parent's current visible
 * extent so an element can't be dragged off the page.
 *
 * While dragging, the cursor is hit-tested for a DIFFERENT container
 * (`resolveReparentDrop`). The element keeps following the cursor inside
 * its current parent AND the target gets drop feedback (gap line for
 * flex/grid, outline for absolute). On release over that target the
 * element is reparented — committed inside the same open transaction so
 * the whole gesture is one undo step.
 * see docs/plans/canvas-drag-reparent-plan.md
 */
export const useMoveInteraction = (geometry, scale) => {
    const [move, setMove] = useState(null);
    const [crossDrop, setCrossDrop] = useState(null);
    /**
     * Latched once the pointer leaves the click slop. Gates only the
     * REPARENT half of the gesture: a click's jitter must never lift an
     * element into another container, but sub-threshold positional nudges
     * stay available for precise placement.
     */
    const armedForReparent = useRef(false);
    const elements = useCanvasStore((s) => s.elements);
    const moveElement = useCanvasStore((s) => s.moveElement);
    const reorderElement = useCanvasStore((s) => s.reorderElement);
    const reparentElement = useCanvasStore((s) => s.reparentElement);
    const setElementSlotName = useCanvasStore((s) => s.setElementSlotName);
    const start = (e, id, el) => {
        // Read-only while previewing a snapshot — no element moves.
        if (useCanvasStore.getState().snapshotPreview !== null)
            return;
        e.preventDefault();
        e.target.setPointerCapture(e.pointerId);
        // Open a history transaction so per-tick `moveElement` calls
        // during the drag coalesce into a single entry on release.
        useHistoryStore.getState().beginHistoryTransaction();
        // Capture where on the element the cursor grabbed (frame-local), so a
        // reparent can keep the element under the cursor on drop.
        const elRect = geometry.measureElementInFrame(id);
        const cursor = geometry.toFrame(e.clientX, e.clientY);
        armedForReparent.current = false;
        // An offset x / y doesn't drive (`left: 50%`, `right: 8px`) starts from
        // where the element is drawn, or the first move jumps it to x / y.
        // see docs/notes/position-offsets.md
        const parentRect = el.parentId === null ? null : geometry.measureElementInFrame(el.parentId);
        const kept = (a, b) => el.customProperties[a] !== undefined || el.customProperties[b] !== undefined;
        const drawn = elRect !== null && parentRect !== null ? { x: elRect.x - parentRect.x, y: elRect.y - parentRect.y } : null;
        setMove({
            id,
            pointerStartX: e.clientX,
            pointerStartY: e.clientY,
            originX: drawn !== null && kept('left', 'right') ? drawn.x : el.x,
            originY: drawn !== null && kept('top', 'bottom') ? drawn.y : el.y,
            grabDX: elRect ? cursor.x - elRect.x : 0,
            grabDY: elRect ? cursor.y - elRect.y : 0,
        });
        setCrossDrop(null);
    };
    const onMove = (e) => {
        if (!move)
            return false;
        const el = elements[move.id];
        if (!el)
            return true;
        const parent = geometry.parentMoveBoundsOf(el.parentId);
        const dx = (e.clientX - move.pointerStartX) / scale;
        const dy = (e.clientY - move.pointerStartY) / scale;
        const proposedX = move.originX + dx;
        const proposedY = move.originY + dy;
        // Move-only clamp: width/height don't change, just keep the rect
        // fully inside the parent box.
        const clampedX = Math.max(0, Math.min(proposedX, parent.w - el.widthValue));
        const clampedY = Math.max(0, Math.min(proposedY, parent.h - el.heightValue));
        moveElement(move.id, Math.round(clampedX), Math.round(clampedY));
        // Resolve a reparent target under the cursor (different container).
        // Absolute elements don't reorder, so siblings are valid targets.
        //
        // Gated on the click slop: a click inside the container's edge band
        // would otherwise retarget one level up and lift the element out on
        // release. see docs/notes/click-vs-drag-slop.md
        if (!armedForReparent.current) {
            armedForReparent.current = hasLeftClickSlop(move.pointerStartX, move.pointerStartY, e.clientX, e.clientY);
        }
        setCrossDrop(armedForReparent.current
            ? resolveReparentDrop(el, { dx: move.grabDX, dy: move.grabDY }, e.clientX, e.clientY, geometry, elements)
            : null);
        return true;
    };
    const onEnd = () => {
        armedForReparent.current = false;
        if (move) {
            // Refuse a slot drop that would create a component cycle (only
            // reachable while editing a component). The element keeps the
            // position it was dragged to; the open transaction still closes as a
            // plain move so the gesture is one clean undo entry.
            const store = useCanvasStore.getState();
            const cycleRefused = crossDrop !== null &&
                slotDropCreatesCycle(crossDrop, move.id, elements, store.componentTrees, store.activeComponent?.name ?? null);
            if (cycleRefused) {
                const dragged = elements[move.id];
                useAppLogStore
                    .getState()
                    .log('warn', `Refused: placing ${dragged?.componentName ?? 'component'} in a slot of ${store.activeComponent?.name ?? 'this component'} would create a cycle.`);
            }
            if (crossDrop && !cycleRefused) {
                // Reparent into the target. The action's own history commit
                // no-ops inside the open transaction; closing it below commits
                // one entry for the whole gesture.
                commitReparentDrop(crossDrop, move.id, elements, reorderElement, reparentElement);
                // Tag the reparented element with the slot it landed in (or clear
                // it when dropping into a normal container). Within the open
                // transaction, so it's part of the same undo entry.
                if (crossDrop.kind === 'absolute') {
                    setElementSlotName(move.id, crossDrop.slotName);
                }
            }
            useHistoryStore
                .getState()
                .endHistoryTransaction({
                kind: crossDrop && !cycleRefused ? 'reorder' : 'move',
                elementIds: [move.id],
            }, useCanvasStore.getState().elements);
        }
        setMove(null);
        setCrossDrop(null);
    };
    const cancel = () => {
        armedForReparent.current = false;
        if (move) {
            // Put the element back where the drag started, then close the
            // transaction without an entry — an abandoned gesture shouldn't
            // leave an undo step behind.
            moveElement(move.id, move.originX, move.originY);
            useHistoryStore.getState().cancelHistoryTransaction();
        }
        setMove(null);
        setCrossDrop(null);
    };
    return { move, crossDrop, start, onMove, onEnd, cancel };
};
