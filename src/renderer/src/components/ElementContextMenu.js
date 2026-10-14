import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { collectViewProps } from '@lib/viewProps';
import { freePropName } from './DataBindings';
import { copyContextToClipboard } from '../lib/copyContext';
import { PageContextMenu } from './PageContextMenu';
import { EXPORT_SECTION_DOM_ID } from './sections/ExportSection';
/**
 * Custom event the menu dispatches when the user picks "Create
 * component" on a non-root, non-instance element. `ProjectShell`
 * listens for it, opens the name-input dialog, and on confirm
 * runs the convert-to-component flow.
 */
export const CONVERT_TO_COMPONENT_EVENT = 'scamp:convert-to-component';
/**
 * Custom event for the Phase 8 "Detach from component" action.
 * Fired by the right-click menu when the target element is a
 * component-instance. `ProjectShell` listens, surfaces a one-way
 * ConfirmDialog (with an override-impact note if any overrides
 * are set), and on confirm runs `detachInstance`.
 */
export const DETACH_INSTANCE_EVENT = 'scamp:detach-instance';
/**
 * Custom event for removing a slot from a component (Phase 4, component
 * slots). Both the right-click menu and the DataPanel Slots list dispatch
 * it rather than calling `toggleSlotOnRect` directly, so `ProjectShell` can
 * first check whether instances on other pages have content in this slot
 * and — if so — surface a confirm dialog before the slot is removed.
 * see docs/archive/2026-07-16-component-slots-plan.md
 */
export const REQUEST_REMOVE_SLOT_EVENT = 'scamp:request-remove-slot';
const EVENT_NAME = 'scamp:open-element-context-menu';
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
export const ElementContextMenu = () => {
    const [menu, setMenu] = useState(null);
    // Subscribe to the menu target's type so we can hide
    // "Create component" for cases where the conversion doesn't
    // apply: the page root (no parent to splice an instance into)
    // and existing component instances (they're already
    // components — converting again would orphan their identity).
    const targetType = useCanvasStore((s) => menu ? s.elements[menu.elementId]?.type : undefined);
    // Slot actions are component-editor-only, on a childless rectangle.
    const activeComponentName = useCanvasStore((s) => s.activeComponent?.name ?? null);
    const inComponent = activeComponentName !== null;
    const targetSlot = useCanvasStore((s) => menu ? s.elements[menu.elementId]?.slot : undefined);
    const targetHasChildren = useCanvasStore((s) => menu ? (s.elements[menu.elementId]?.childIds.length ?? 0) > 0 : false);
    // "Delete contents" is offered only when there's something to clear:
    // child elements, loose "Raw" inline fragments, or the element's own
    // text. Empty elements don't show the item.
    const targetHasContents = useCanvasStore((s) => {
        if (!menu)
            return false;
        const el = s.elements[menu.elementId];
        if (!el)
            return false;
        return (el.childIds.length > 0 ||
            el.inlineFragments.length > 0 ||
            (typeof el.text === 'string' && el.text.length > 0));
    });
    const toggleSlotOnRect = useCanvasStore((s) => s.toggleSlotOnRect);
    // Repeat / show bindings (Data tab). see docs/notes/view-bindings.md
    const setRepeat = useCanvasStore((s) => s.setRepeat);
    const setShowIf = useCanvasStore((s) => s.setShowIf);
    const targetRepeat = useCanvasStore((s) => menu ? s.elements[menu.elementId]?.repeat : undefined);
    const targetShowIf = useCanvasStore((s) => menu ? s.elements[menu.elementId]?.showIf : undefined);
    const deleteElementContents = useCanvasStore((s) => s.deleteElementContents);
    const duplicateElement = useCanvasStore((s) => s.duplicateElement);
    const copyElements = useCanvasStore((s) => s.copyElements);
    const cutElements = useCanvasStore((s) => s.cutElements);
    const pasteElement = useCanvasStore((s) => s.pasteElement);
    const hasClipboard = useCanvasStore((s) => s.clipboard !== null);
    useEffect(() => {
        const handler = (e) => {
            const detail = e.detail;
            if (!detail)
                return;
            setMenu({
                x: detail.x,
                y: detail.y,
                elementId: detail.elementId,
                ...(detail.canvasPoint ? { canvasPoint: detail.canvasPoint } : {}),
            });
        };
        window.addEventListener(EVENT_NAME, handler);
        return () => window.removeEventListener(EVENT_NAME, handler);
    }, []);
    if (!menu)
        return null;
    const canConvert = menu.elementId !== ROOT_ELEMENT_ID &&
        targetType !== 'component-instance';
    const isInstance = targetType === 'component-instance';
    const isRect = targetType === 'rectangle' && menu.elementId !== ROOT_ELEMENT_ID;
    const isSlot = typeof targetSlot === 'string' && targetSlot.length > 0;
    // "Make slot" needs a childless rectangle inside a component (a slot's
    // JSX becomes `{slotName}`, so it can't have its own children — this also
    // prevents nested slots). "Remove slot" shows on an existing slot.
    const canMakeSlot = inComponent && isRect && !isSlot && !targetHasChildren;
    const canRemoveSlot = inComponent && isRect && isSlot;
    // The page root is the one thing that can't be duplicated (the store
    // action rejects it), so it gets no item rather than a dead one.
    const canDuplicate = menu.elementId !== ROOT_ELEMENT_ID;
    const items = [
        ...(canDuplicate
            ? [
                {
                    label: 'Duplicate',
                    onSelect: () => duplicateElement(menu.elementId),
                },
            ]
            : []),
        // Right-click selects the element it hit before opening the menu, so
        // these act on that one element — same as Duplicate above. Cmd+C /
        // Cmd+X are the multi-select path. Both are offered on the page root
        // too: the store expands it to its children.
        {
            label: 'Copy',
            onSelect: () => copyElements([menu.elementId]),
        },
        {
            label: 'Cut',
            onSelect: () => cutElements([menu.elementId]),
        },
        {
            label: 'Paste',
            disabled: !hasClipboard,
            // Right-clicking the canvas pastes where you clicked; from the
            // layers tree there's no point to paste at, so it offsets.
            onSelect: () => pasteElement(menu.canvasPoint ? { at: menu.canvasPoint } : undefined),
        },
        ...(inComponent && menu.elementId !== ROOT_ELEMENT_ID
            ? [
                targetRepeat === undefined
                    ? {
                        label: 'Repeat this…',
                        onSelect: () => {
                            const state = useCanvasStore.getState();
                            const taken = collectViewProps(state.elements, state.rootElementId).map((p) => p.name);
                            setRepeat(menu.elementId, { over: freePropName('items', taken), as: 'item' });
                        },
                    }
                    : { label: 'Stop repeating', onSelect: () => setRepeat(menu.elementId, null) },
                targetShowIf === undefined
                    ? {
                        label: 'Show only when…',
                        onSelect: () => {
                            const state = useCanvasStore.getState();
                            const taken = collectViewProps(state.elements, state.rootElementId).map((p) => p.name);
                            setShowIf(menu.elementId, freePropName('visible', taken));
                        },
                    }
                    : { label: 'Always show', onSelect: () => setShowIf(menu.elementId, null) },
            ]
            : []),
        ...(canMakeSlot
            ? [
                {
                    label: 'Make slot',
                    onSelect: () => toggleSlotOnRect(menu.elementId),
                },
            ]
            : []),
        ...(canRemoveSlot
            ? [
                {
                    label: 'Remove slot',
                    onSelect: () => {
                        // Route through ProjectShell so it can warn when instances on
                        // other pages have content in this slot. With no active
                        // component name (shouldn't happen when canRemoveSlot) fall
                        // back to a direct removal.
                        if (activeComponentName === null ||
                            typeof targetSlot !== 'string') {
                            toggleSlotOnRect(menu.elementId);
                            return;
                        }
                        window.dispatchEvent(new CustomEvent(REQUEST_REMOVE_SLOT_EVENT, {
                            detail: {
                                elementId: menu.elementId,
                                componentName: activeComponentName,
                                slotName: targetSlot,
                            },
                        }));
                    },
                },
            ]
            : []),
        ...(canConvert
            ? [
                {
                    label: 'Create component…',
                    onSelect: () => {
                        window.dispatchEvent(new CustomEvent(CONVERT_TO_COMPONENT_EVENT, { detail: { elementId: menu.elementId } }));
                    },
                },
            ]
            : []),
        ...(isInstance
            ? [
                {
                    label: 'Detach from component…',
                    onSelect: () => {
                        window.dispatchEvent(new CustomEvent(DETACH_INSTANCE_EVENT, { detail: { instanceId: menu.elementId } }));
                    },
                },
            ]
            : []),
        ...(targetHasContents
            ? [
                {
                    label: 'Delete contents',
                    onSelect: () => deleteElementContents(menu.elementId),
                },
            ]
            : []),
        {
            label: 'Copy context for agent',
            // Reads the store's selection rather than `menu.elementId`, for the
            // same reason Export does: `handleContextMenu` selects the element
            // before opening the menu, so the two are already in lockstep, and
            // the copied text then matches what the panel is showing.
            onSelect: () => {
                void copyContextToClipboard();
            },
        },
        {
            label: 'Export…',
            onSelect: () => {
                const section = document.getElementById(EXPORT_SECTION_DOM_ID);
                if (section) {
                    section.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            },
        },
    ];
    return (_jsx(PageContextMenu, { x: menu.x, y: menu.y, onClose: () => setMenu(null), items: items }));
};
