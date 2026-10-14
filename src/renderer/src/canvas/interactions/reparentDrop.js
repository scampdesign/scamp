import { isColumnDirection } from '@lib/flexAxis';
import { wouldCreateComponentCycle } from '@lib/componentUsage';
import { resolveDropZone } from '@lib/dropZones';
import { elementIdOf } from './canvasHitTest';
/**
 * True when committing this slot drop would create a component cycle. Only
 * an absolute drop whose target is a component-instance is a slot drop, and
 * only a dragged component-instance can introduce a reference. The cycle is
 * checked against the component currently being edited (`activeComponentName`)
 * — dropping into a slot while editing component A folds the dragged
 * component into A's definition; if it transitively uses A, that's a cycle.
 * On a page (`activeComponentName` null) this is always false.
 * see docs/notes/components-multi-file-ops.md
 */
export const slotDropCreatesCycle = (drop, draggedId, elements, componentTrees, activeComponentName) => {
    if (drop.kind !== 'absolute')
        return false;
    const target = elements[drop.targetId];
    if (!target || target.type !== 'component-instance')
        return false;
    const dragged = elements[draggedId];
    if (!dragged ||
        dragged.type !== 'component-instance' ||
        !dragged.componentName) {
        return false;
    }
    return wouldCreateComponentCycle(componentTrees, activeComponentName, dragged.componentName);
};
const LINE = 2;
/**
 * Stand-in for "no element is being dragged" — used by the component
 * sidebar drag, which creates a NEW instance rather than moving an
 * existing one. No element can have this id, so self-exclusion checks
 * (`isSelfOrDescendant`, sibling filtering) become no-ops.
 */
export const NO_DRAGGED_ID = '';
/**
 * Gap-line indicator + insert index for dropping into a flow (flex/grid)
 * container. Generalised from the same-parent reorder math to any parent.
 * Grid containers append to the end (Q3); flex uses the sibling under the
 * cursor and which side of its centre. When no sibling is under the cursor
 * (empty container, padding, between rows), falls back to appending at the
 * container's trailing edge so any drop inside the container is valid.
 */
/**
 * Which axis "before / after this sibling" is measured along.
 *
 * Flex says so directly (`flexDirection`). A grid doesn't have one main
 * axis — items flow across columns AND down rows — so the axis comes
 * from the gesture instead: whichever edge of the item the cursor is
 * proportionally nearer. Dragging toward a cell's left edge in a
 * multi-column grid and toward its top edge in a single-column one both
 * mean "before this one" in reading order, which is exactly the childIds
 * order the drop resolves to.
 *
 * Ties (dead centre) resolve to the block axis, so the answer is
 * deterministic rather than flickering.
 */
const flowAxisIsHorizontal = (parent, sibling, cursor) => {
    if (parent.display !== 'grid')
        return !isColumnDirection(parent.flexDirection);
    if (sibling.w <= 0 || sibling.h <= 0)
        return false;
    const dx = Math.abs(cursor.x - (sibling.x + sibling.w / 2)) / sibling.w;
    const dy = Math.abs(cursor.y - (sibling.y + sibling.h / 2)) / sibling.h;
    return dx > dy;
};
export const flowIndicator = (parent, 
/** Excluded from sibling scanning. Pass `NO_DRAGGED_ID` when the drag
 *  isn't moving an existing element (a new instance from the sidebar). */
draggedId, clientX, clientY, geometry) => {
    const containerRect = geometry.measureElementInFrame(parent.id);
    const siblingIds = parent.childIds.filter((id) => id !== draggedId);
    let hitSiblingId = null;
    for (const node of document.elementsFromPoint(clientX, clientY)) {
        const id = elementIdOf(node);
        if (id && siblingIds.includes(id)) {
            hitSiblingId = id;
            break;
        }
    }
    if (hitSiblingId) {
        const r = geometry.measureElementInFrame(hitSiblingId);
        if (r) {
            const cursor = geometry.toFrame(clientX, clientY);
            const isRow = flowAxisIsHorizontal(parent, r, cursor);
            const before = isRow
                ? cursor.x < r.x + r.w / 2
                : cursor.y < r.y + r.h / 2;
            const siblingIdx = parent.childIds.indexOf(hitSiblingId);
            const newIndex = before ? siblingIdx : siblingIdx + 1;
            const rect = isRow
                ? {
                    x: before ? r.x - LINE / 2 : r.x + r.w - LINE / 2,
                    y: r.y,
                    w: LINE,
                    h: r.h,
                }
                : {
                    x: r.x,
                    y: before ? r.y - LINE / 2 : r.y + r.h - LINE / 2,
                    w: r.w,
                    h: LINE,
                };
            return { rect, newIndex, containerRect };
        }
    }
    // Append fallback: no sibling under the cursor (empty container, its
    // padding, the space past the last row) — a line at the container's
    // trailing inner edge, dropping at the end of the child list.
    if (!containerRect)
        return null;
    const cr = containerRect;
    const rect = parent.display === 'flex' && !isColumnDirection(parent.flexDirection)
        ? { x: cr.x + cr.w - LINE, y: cr.y, w: LINE, h: cr.h }
        : { x: cr.x, y: cr.y + cr.h - LINE, w: cr.w, h: LINE };
    return { rect, newIndex: parent.childIds.length, containerRect };
};
/**
 * When the cursor sits in a container's leading or trailing edge band,
 * the user means "beside this", not "inside it" — so the drop retargets
 * to that container's parent, and `flowIndicator` then resolves which
 * side.
 *
 * Only inside a **flow** parent (flex or grid). In an absolute parent
 * sibling order doesn't move anything — position is x/y — so offering
 * "between" would promise something the user can't see.
 *
 * Returns the parent id to retarget to, or null to leave the drop alone.
 * see docs/archive/2026-08-13-drop-placement-helpers-plan.md
 */
const besideTargetFor = (hit, clientX, clientY, geometry, elements) => {
    // A slot zone is a routing target, not a box with edges to be beside.
    if (hit.slotName !== undefined)
        return null;
    const el = elements[hit.parentId];
    const parentId = el?.parentId;
    const parent = parentId ? elements[parentId] : undefined;
    if (!el || !parentId || !parent)
        return null;
    if (parent.display !== 'flex' && parent.display !== 'grid')
        return null;
    const r = geometry.measureElementInFrame(hit.parentId);
    if (!r)
        return null;
    const cursor = geometry.toFrame(clientX, clientY);
    const isRow = flowAxisIsHorizontal(parent, r, cursor);
    const zone = resolveDropZone({
        rect: isRow ? { start: r.x, size: r.w } : { start: r.y, size: r.h },
        cursor: isRow ? cursor.x : cursor.y,
        canHoldChildren: true,
    });
    return zone === 'inside' ? null : parentId;
};
/**
 * Resolve a pending reparent for the dragged element under the cursor, or
 * null when there's no valid DIFFERENT container (decision (b): reparent
 * only when the target differs from the current parent). `grab` is the
 * frame-local offset of the cursor within the dragged element, used to
 * keep the element under the cursor when dropping into an absolute parent.
 */
export const resolveReparentDrop = (draggedEl, grab, clientX, clientY, geometry, elements) => {
    // Any different container under the cursor is a valid nest target —
    // siblings included. Reordering a flex child still works: dropping in the
    // GAP between siblings targets the shared PARENT (rejected below as
    // "same parent"), so it falls through to the reorder path; only dropping
    // onto a sibling's body nests into it. see docs/archive/2026-07-16-component-slots-plan.md
    const hit = geometry.resolveDropContainer(clientX, clientY, draggedEl.id);
    if (!hit)
        return null;
    // …except near its edges. Without this the only way to drop BESIDE a
    // container inside a flex parent is to hit the gap between siblings;
    // anywhere on its body nests you inside it, which is the "I meant
    // between" problem. see docs/archive/2026-08-13-drop-placement-helpers-plan.md
    const beside = besideTargetFor(hit, clientX, clientY, geometry, elements);
    const drop = beside ? { parentId: beside, isFlow: true } : hit;
    if (drop.parentId === draggedEl.parentId)
        return null;
    if (drop.isFlow) {
        const parent = elements[drop.parentId];
        if (!parent)
            return null;
        const indicator = flowIndicator(parent, draggedEl.id, clientX, clientY, geometry);
        if (!indicator)
            return null;
        return { kind: 'flow', targetId: drop.parentId, indicator };
    }
    const rect = geometry.measureElementInFrame(drop.parentId);
    if (!rect)
        return null;
    const cursor = geometry.toFrame(clientX, clientY);
    const localX = cursor.x - rect.x - grab.dx;
    const localY = cursor.y - rect.y - grab.dy;
    const x = Math.round(Math.max(0, Math.min(localX, rect.w - draggedEl.widthValue)));
    const y = Math.round(Math.max(0, Math.min(localY, rect.h - draggedEl.heightValue)));
    return {
        kind: 'absolute',
        targetId: drop.parentId,
        rect,
        x,
        y,
        // The default `children` slot carries no explicit slotName (it emits as
        // JSX children); only named slots get one.
        ...(drop.slotName !== undefined && drop.slotName !== 'children'
            ? { slotName: drop.slotName }
            : {}),
    };
};
/**
 * Resolve where a component dragged in from the sidebar would land.
 *
 * Same container resolution as `resolveReparentDrop`, minus the two rules
 * that only make sense when moving an existing element: there's nothing to
 * exclude from the hit-test, and there's no "current parent" to reject as a
 * no-op — dropping onto the element you're already inside is a real drop
 * here. Falls back to the page root, so a drop anywhere on the canvas
 * always produces an instance.
 * see docs/notes/components-data-model.md
 */
export const resolveComponentDrop = (clientX, clientY, geometry, elements, rootId) => {
    const drop = geometry.resolveDropContainer(clientX, clientY, NO_DRAGGED_ID);
    const targetId = drop?.parentId ?? rootId;
    const target = elements[targetId];
    const isFlow = drop?.isFlow ?? (target?.display === 'flex' || target?.display === 'grid');
    if (isFlow && target) {
        const indicator = flowIndicator(target, NO_DRAGGED_ID, clientX, clientY, geometry);
        if (indicator)
            return { kind: 'flow', targetId, indicator };
    }
    // Absolute target: drop at the cursor in the container's local space. A
    // new instance has no size yet (the component's own root defines its
    // box), so there's no dimension to offset or clamp against — the cursor
    // point IS the top-left.
    const rect = geometry.measureElementInFrame(targetId) ?? {
        x: 0,
        y: 0,
        w: 0,
        h: 0,
    };
    const cursor = geometry.toFrame(clientX, clientY);
    return {
        kind: 'absolute',
        targetId,
        rect,
        x: Math.round(Math.max(0, Math.min(cursor.x - rect.x, rect.w))),
        y: Math.round(Math.max(0, Math.min(cursor.y - rect.y, rect.h))),
        ...(drop?.slotName !== undefined && drop.slotName !== 'children'
            ? { slotName: drop.slotName }
            : {}),
    };
};
/**
 * Commit a resolved reparent. Flow targets reorder into the destination
 * at the computed index (layout owns position); absolute targets reparent
 * with the drop position appended to the container's children.
 */
export const commitReparentDrop = (drop, draggedId, elements, reorderElement, reparentElement) => {
    if (drop.kind === 'flow') {
        reorderElement(draggedId, drop.targetId, drop.indicator.newIndex);
        return;
    }
    const target = elements[drop.targetId];
    const index = target ? target.childIds.length : 0;
    reparentElement(draggedId, drop.targetId, index, { x: drop.x, y: drop.y });
};
