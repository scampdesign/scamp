/**
 * Read a node's `data-element-id`, for both HTML and SVG elements. An
 * inline `<svg>` on the canvas is an `SVGElement`, not an `HTMLElement`,
 * so an `instanceof HTMLElement` filter skips it and its shape children —
 * making the svg unhittable by `elementsFromPoint` (can't click-select it,
 * can't target it while dragging). Both element kinds carry `dataset`.
 */
export const elementIdOf = (node) => node instanceof HTMLElement || node instanceof SVGElement
    ? node.dataset['elementId']
    : undefined;
/**
 * Hit-test the cursor against existing elements. Returns the deepest
 * `data-element-id` under the point.
 */
export const hitTest = (clientX, clientY) => {
    const candidates = document.elementsFromPoint(clientX, clientY);
    for (const node of candidates) {
        const id = elementIdOf(node);
        if (id)
            return id;
    }
    return null;
};
/**
 * The component instance under the cursor: the first element in the
 * stack that the page knows as an instance. A component's own elements
 * render inside the instance but aren't page elements, so `hitTest` can
 * land on one of those first.
 */
export const instanceAt = (clientX, clientY, isInstance) => {
    for (const node of document.elementsFromPoint(clientX, clientY)) {
        const id = elementIdOf(node);
        if (id !== undefined && isInstance(id))
            return id;
    }
    return null;
};
/**
 * Look for a component slot drop zone under the cursor, for the CREATE
 * tools (draw a rect / click the text tool inside a slot). Mirrors the
 * drag-path check in `resolveDropContainer`: a slot box carries
 * `data-scamp-slot` + `data-slot-owner-id` (the instance's canvas id).
 * Returns the owning instance + slot name so a new element can be created
 * as that instance's slot content. Returns null when a real page element
 * is hit first (create nests into it as usual, not into a slot).
 * see docs/archive/2026-07-16-component-slots-plan.md
 */
export const slotZoneAt = (clientX, clientY) => {
    const candidates = document.elementsFromPoint(clientX, clientY);
    for (const node of candidates) {
        if (!(node instanceof HTMLElement)) {
            // An SVG page element under the cursor blocks slot routing too.
            if (elementIdOf(node))
                return null;
            continue;
        }
        const slotName = node.dataset['scampSlot'];
        const ownerId = node.dataset['slotOwnerId'];
        if (slotName && ownerId)
            return { ownerId, slotName };
        // A real page element hit before any slot zone → no slot routing.
        if (node.dataset['elementId'])
            return null;
    }
    return null;
};
/**
 * Look for a prop-text span under the cursor. Prop-text on a component
 * instance carries `data-scamp-instance-id` + `data-scamp-prop`
 * (set in ElementRenderer's `renderComponentSubtree`). We only surface
 * a hit if we see those before we walk through the instance's
 * `data-element-id` wrapper — otherwise a deeper match would jump out
 * of the instance we actually clicked.
 */
export const propTextHitTest = (clientX, clientY) => {
    const candidates = document.elementsFromPoint(clientX, clientY);
    for (const node of candidates) {
        if (!(node instanceof HTMLElement))
            continue;
        const instanceId = node.dataset['scampInstanceId'];
        const propName = node.dataset['scampProp'];
        if (instanceId && propName)
            return { instanceId, propName };
        if (node.dataset['elementId'])
            return null;
    }
    return null;
};
export const isResizeHandle = (clientX, clientY) => {
    const candidates = document.elementsFromPoint(clientX, clientY);
    for (const node of candidates) {
        if (node instanceof HTMLElement && node.dataset['handle']) {
            return node.dataset['handle'];
        }
    }
    return null;
};
