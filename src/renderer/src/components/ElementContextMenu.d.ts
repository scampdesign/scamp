/**
 * Custom event the menu dispatches when the user picks "Create
 * component" on a non-root, non-instance element. `ProjectShell`
 * listens for it, opens the name-input dialog, and on confirm
 * runs the convert-to-component flow.
 */
export declare const CONVERT_TO_COMPONENT_EVENT = "scamp:convert-to-component";
export type ConvertToComponentEventDetail = {
    elementId: string;
};
/**
 * Custom event for the Phase 8 "Detach from component" action.
 * Fired by the right-click menu when the target element is a
 * component-instance. `ProjectShell` listens, surfaces a one-way
 * ConfirmDialog (with an override-impact note if any overrides
 * are set), and on confirm runs `detachInstance`.
 */
export declare const DETACH_INSTANCE_EVENT = "scamp:detach-instance";
export type DetachInstanceEventDetail = {
    instanceId: string;
};
/**
 * Custom event for removing a slot from a component (Phase 4, component
 * slots). Both the right-click menu and the DataPanel Slots list dispatch
 * it rather than calling `toggleSlotOnRect` directly, so `ProjectShell` can
 * first check whether instances on other pages have content in this slot
 * and — if so — surface a confirm dialog before the slot is removed.
 * see docs/archive/2026-07-16-component-slots-plan.md
 */
export declare const REQUEST_REMOVE_SLOT_EVENT = "scamp:request-remove-slot";
export type RequestRemoveSlotEventDetail = {
    /** Canvas id of the slot rectangle (passed to `toggleSlotOnRect`). */
    elementId: string;
    /** Component currently being edited (to scan its instances). */
    componentName: string;
    /** The slot's name (`children` for the default slot). */
    slotName: string;
};
/**
 * Single-instance context menu for canvas elements. Listens for the
 * `scamp:open-element-context-menu` custom event dispatched by
 * `ElementRenderer.onContextMenu`, opens at the supplied coordinates,
 * dismisses on outside click / Escape (handled by the underlying
 * `PageContextMenu` primitive).
 *
 * Item visibility is computed per target — slot actions only inside the
 * component editor, "Create component" not on the root or an instance, and
 * so on. "Copy context for agent" and "Export…" always show, since both act
 * on whatever is selected.
 */
export declare const ElementContextMenu: () => JSX.Element | null;
