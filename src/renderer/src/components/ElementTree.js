import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { IconChevronDown, IconChevronRight, IconComponents } from '@tabler/icons-react';
import { useCanvasStore } from '@store/canvasSlice';
import { classNameFor } from '@lib/generateCode';
import { canContainChildren } from '@lib/insertParent';
import { resolveDropZone } from '@lib/dropZones';
import { ROOT_ELEMENT_ID, slugifyName } from '@lib/element';
import { ancestorIds, descendantIds, flattenTree, hasChildRows, hasCollapsedAncestor, } from '@lib/treeRows';
import { Tooltip } from './controls/Tooltip';
import styles from './ElementTree.module.css';
/**
 * Layers panel: a collapsible-by-depth tree of every element in the
 * current page, in DOM order. Clicking a row selects that element on the
 * canvas; selecting on the canvas highlights the matching row.
 *
 * Drag-and-drop reorders the tree:
 *   - Drop in the top half of a row → become its previous sibling
 *   - Drop in the bottom half → become its next sibling
 *   - Drop in the middle of a rectangle row → become its last child
 *
 * The drop target and indicator position live in `dragOver` state on the
 * tree component (not on individual rows) so React only re-renders one
 * row's worth of indicator at a time.
 */
const DRAG_MIME = 'application/x-scamp-element-id';
/** Matches the row's per-depth indent so the triangle sits with its row. */
const INDENT_PX = 12;
/** Convert a slug like "hero_card" to title case "Hero Card". */
const titleCaseFromSlug = (slug) => slug
    .split('_')
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
    .join(' ');
const labelFor = (el) => {
    if (el.id === ROOT_ELEMENT_ID)
        return 'Page';
    if (el.type === 'component-instance') {
        // Component name is the user-facing identity. The instance id
        // (`inst_a1b2`) goes in the tooltip via `classNameFor` for
        // disambiguation when the user has multiple instances of the
        // same component on the page.
        return el.componentName ?? 'Component';
    }
    if (el.name)
        return titleCaseFromSlug(el.name);
    if (el.type === 'text') {
        const text = (el.text ?? '').trim();
        return text.length > 0 ? `Text · ${truncate(text, 20)}` : 'Text';
    }
    if (el.type === 'image')
        return el.tag === 'svg' ? 'SVG' : 'Image';
    if (el.type === 'input')
        return 'Input';
    return 'Rectangle';
};
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
/**
 * Decide whether the cursor's vertical position over a row means
 * "before", "after", or "inside".
 *
 * Delegates the split to `resolveDropZone` so the tree and the canvas
 * agree — including which elements can hold children at all, which the
 * tree used to answer for itself (and got wrong for images and inputs).
 */
const computeDropPosition = (e, el) => {
    // Root: only "inside" is meaningful — you can't put a sibling next to
    // the page itself.
    if (el.id === ROOT_ELEMENT_ID)
        return 'inside';
    const rect = e.currentTarget.getBoundingClientRect();
    return resolveDropZone({
        rect: { start: rect.top, size: rect.height },
        cursor: e.clientY,
        canHoldChildren: canContainChildren(el),
    });
};
const Row = ({ element, depth, dragOver, setDragOver, showToggle, collapsed, hasSelectedInside, }) => {
    const toggleCollapsed = useCanvasStore((s) => s.toggleCollapsed);
    const setCollapsed = useCanvasStore((s) => s.setCollapsed);
    const isSelected = useCanvasStore((s) => s.selectedElementIds.includes(element.id));
    const selectElement = useCanvasStore((s) => s.selectElement);
    const toggleSelectElement = useCanvasStore((s) => s.toggleSelectElement);
    const reorderElement = useCanvasStore((s) => s.reorderElement);
    const patchElement = useCanvasStore((s) => s.patchElement);
    // In the component editor the root is the component itself.
    const componentName = useCanvasStore((s) => (s.activeComponent?.kind === 'component' ? s.activeComponent.name : null));
    const isComponentRoot = element.id === ROOT_ELEMENT_ID && componentName !== null;
    const ref = useRef(null);
    const inputRef = useRef(null);
    const [renaming, setRenaming] = useState(false);
    const [draft, setDraft] = useState('');
    // When the selection lands on this row from the canvas, scroll the tree
    // so the row is visible. Cheap and only fires for the selected row.
    useEffect(() => {
        if (isSelected) {
            ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }, [isSelected]);
    const isDragTarget = dragOver?.targetId === element.id;
    const showBefore = isDragTarget && dragOver.position === 'before';
    const showAfter = isDragTarget && dragOver.position === 'after';
    const showInside = isDragTarget && dragOver.position === 'inside';
    const handleDragStart = (e) => {
        if (element.id === ROOT_ELEMENT_ID) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData(DRAG_MIME, element.id);
        e.dataTransfer.effectAllowed = 'move';
    };
    const handleDragOver = (e) => {
        // Only react if the drag carries one of our element ids.
        if (!e.dataTransfer.types.includes(DRAG_MIME))
            return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const position = computeDropPosition(e, element);
        if (!dragOver ||
            dragOver.targetId !== element.id ||
            dragOver.position !== position) {
            setDragOver({ targetId: element.id, position });
        }
    };
    const handleDragLeave = (e) => {
        // Only clear if the cursor truly left the row (not just moved to a child).
        const related = e.relatedTarget;
        if (related && e.currentTarget.contains(related))
            return;
        if (dragOver?.targetId === element.id)
            setDragOver(null);
    };
    const handleDrop = (e) => {
        const draggedId = e.dataTransfer.getData(DRAG_MIME);
        setDragOver(null);
        if (!draggedId || draggedId === element.id)
            return;
        e.preventDefault();
        runDrop(draggedId, element, computeDropPosition(e, element), reorderElement);
    };
    return (_jsxs("div", { ref: ref, className: `${styles.rowWrap} ${showInside ? styles.rowDropInside : ''}`, draggable: element.id !== ROOT_ELEMENT_ID, onDragStart: handleDragStart, onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop, "data-testid": "layers-row", "data-element-id": element.id, "data-element-class": classNameFor(element), children: [showBefore && (_jsx("div", { className: styles.dropLine, style: { left: 8 + depth * INDENT_PX } })), showToggle && (_jsx("button", { type: "button", className: styles.disclosure, 
                // Positioned against the wrapper rather than nested in the row
                // button — a button inside a button is invalid and breaks
                // keyboard semantics.
                style: { left: 4 + depth * INDENT_PX }, "aria-label": collapsed ? 'Expand children' : 'Collapse children', "aria-expanded": !collapsed, "data-action": "toggle-collapse", onClick: (e) => {
                    // Don't let the click fall through and select the row.
                    e.stopPropagation();
                    if (e.altKey) {
                        // Alt+click folds the whole subtree, Figma-style.
                        const subtree = descendantIds(useCanvasStore.getState().elements, element.id);
                        setCollapsed([element.id, ...subtree], !collapsed);
                        return;
                    }
                    toggleCollapsed(element.id);
                }, onPointerDown: (e) => e.stopPropagation(), children: collapsed ? (_jsx(IconChevronRight, { size: 12 })) : (_jsx(IconChevronDown, { size: 12 })) })), collapsed && hasSelectedInside && (_jsx("span", { className: styles.hiddenSelection, "data-testid": "hidden-selection-dot", "aria-hidden": true })), _jsx(Tooltip, { label: `.${classNameFor(element)}`, children: _jsxs("button", { type: "button", className: `${styles.row} ${isSelected ? styles.rowSelected : ''}`, 
                    // Leaves room for the disclosure triangle at every depth, including
                    // on rows that don't have one — so labels stay on a single line
                    // down the tree instead of jogging left for childless rows.
                    style: { paddingLeft: 22 + depth * INDENT_PX }, onClick: (e) => {
                        if (renaming)
                            return;
                        if (e.shiftKey)
                            toggleSelectElement(element.id);
                        else
                            selectElement(element.id);
                    }, onContextMenu: (e) => {
                        if (renaming)
                            return;
                        e.preventDefault();
                        e.stopPropagation();
                        // Mirror the canvas right-click: select the target, then open the
                        // shared element context menu (ElementContextMenu listens globally
                        // for this event, so the menu and its items are identical).
                        selectElement(element.id);
                        window.dispatchEvent(new CustomEvent('scamp:open-element-context-menu', {
                            detail: { x: e.clientX, y: e.clientY, elementId: element.id },
                        }));
                    }, onDoubleClick: () => {
                        // Root can't be renamed.
                        if (element.id === ROOT_ELEMENT_ID)
                            return;
                        setDraft(element.name ? titleCaseFromSlug(element.name) : '');
                        setRenaming(true);
                        // Focus the input on next tick after it renders.
                        requestAnimationFrame(() => {
                            inputRef.current?.focus();
                            inputRef.current?.select();
                        });
                    }, children: [element.type === 'component-instance' || isComponentRoot ? (
                        // The sidebar's Components icon, in the component purple, as Figma marks them.
                        _jsx("span", { className: `${styles.icon} ${styles.componentIcon}`, "aria-hidden": "true", children: _jsx(IconComponents, { size: 12, stroke: 2 }) })) : (_jsx("span", { className: styles.icon, "aria-hidden": "true", children: element.type === 'text' ? 'T' : element.type === 'image' && element.tag === 'svg' ? '✦' : '▢' })), renaming ? (_jsx("input", { ref: inputRef, type: "text", className: styles.renameInput, value: draft, onChange: (e) => setDraft(e.target.value), onBlur: () => {
                                const slug = slugifyName(draft);
                                patchElement(element.id, {
                                    name: slug.length > 0 ? slug : undefined,
                                });
                                setRenaming(false);
                            }, onKeyDown: (e) => {
                                if (e.key === 'Enter') {
                                    e.currentTarget.blur();
                                }
                                if (e.key === 'Escape') {
                                    setRenaming(false);
                                }
                                // Stop propagation so typing doesn't trigger tool shortcuts.
                                e.stopPropagation();
                            }, onClick: (e) => e.stopPropagation(), onPointerDown: (e) => e.stopPropagation() })) : (_jsx("span", { className: styles.label, children: isComponentRoot ? componentName : labelFor(element) }))] }) }), showAfter && (_jsx("div", { className: styles.dropLine, style: { left: 8 + depth * INDENT_PX } }))] }));
};
/**
 * Apply a tree-row drop to the store. Resolves the (target, position)
 * pair into a (newParentId, newIndex) pair that the store action expects.
 */
const runDrop = (draggedId, target, position, reorder) => {
    if (position === 'inside') {
        // Drop into the target as the last child. Root and rectangles allow
        // this; text elements never reach this branch (computeDropPosition
        // refuses).
        reorder(draggedId, target.id, target.childIds.length);
        return;
    }
    // Before / after: insert next to `target` in target.parent.childIds.
    if (!target.parentId)
        return;
    const parent = useCanvasStore.getState().elements[target.parentId];
    if (!parent)
        return;
    const idx = parent.childIds.indexOf(target.id);
    if (idx < 0)
        return;
    const insertAt = position === 'before' ? idx : idx + 1;
    reorder(draggedId, target.parentId, insertAt);
};
export const ElementTree = () => {
    const rootElementId = useCanvasStore((s) => s.rootElementId);
    const elements = useCanvasStore((s) => s.elements);
    const collapsedIds = useCanvasStore((s) => s.collapsedIds);
    const selectedId = useCanvasStore((s) => s.selectedElementIds[0] ?? null);
    const setCollapsed = useCanvasStore((s) => s.setCollapsed);
    const [dragOver, setDragOver] = useState(null);
    // Reveal a selection that's hidden inside a collapsed branch.
    //
    // Two things keep this from fighting the user, and both are load-bearing:
    //
    // 1. It's keyed on the selected id, NOT on `collapsedIds`. Re-running on
    //    collapse changes would spring a branch open the instant it was
    //    folded over the selection.
    // 2. It skips the run where the id merely came into view — mount included.
    //    The tree unmounts whenever the Design System panel opens, so without
    //    this a round trip through that panel would silently undo the user's
    //    collapse. The `lastSelected` ref starts AT the current selection so
    //    the mount pass is a no-op.
    //
    // The hidden-selection dot covers what this deliberately doesn't do.
    const lastSelected = useRef(selectedId);
    useEffect(() => {
        if (selectedId === null || lastSelected.current === selectedId)
            return;
        lastSelected.current = selectedId;
        const store = useCanvasStore.getState();
        const hidden = ancestorIds(store.elements, selectedId).filter((id) => store.collapsedIds[id] === true);
        if (hidden.length > 0)
            setCollapsed(hidden, false);
    }, [selectedId, setCollapsed]);
    // Element rows are draggable and clickable; "raw" rows appear under any
    // element with inlineFragments (loose text or unclassed JSX captured by
    // the parser) so the user can see the fragments exist even though they're
    // not editable from the canvas.
    const rows = flattenTree(elements, rootElementId, collapsedIds);
    const selectionHiddenUnder = (id) => selectedId !== null &&
        selectedId !== id &&
        ancestorIds(elements, selectedId).includes(id) &&
        hasCollapsedAncestor(elements, selectedId, collapsedIds);
    return (_jsx("div", { className: styles.tree, onDragEnd: () => setDragOver(null), onDragLeave: (e) => {
            // Clear when the drag leaves the entire tree, not just one row.
            if (e.currentTarget.contains(e.relatedTarget))
                return;
            setDragOver(null);
        }, children: rows.map((row) => row.kind === 'element' ? (_jsx(Row, { element: row.element, depth: row.depth, dragOver: dragOver, setDragOver: setDragOver, 
            // No triangle on the root: collapsing it would hide the whole
            // tree, which is easy to hit by accident and hard to read.
            showToggle: row.element.id !== rootElementId && hasChildRows(row.element), collapsed: collapsedIds[row.element.id] === true, hasSelectedInside: selectionHiddenUnder(row.element.id) }, row.element.id)) : (_jsx(RawRow, { parentId: row.parentId, count: row.count, depth: row.depth }, `${row.parentId}-raw`))) }));
};
/**
 * Non-interactive row showing "Raw (N)" under any element that has
 * loose text or unclassed JSX captured in `inlineFragments`. Edit by
 * touching the TSX file directly — these fragments aren't surfaced
 * via the canvas because Scamp doesn't model them as elements.
 */
const RawRow = ({ parentId, count, depth }) => {
    const elements = useCanvasStore((s) => s.elements);
    const fragments = elements[parentId]?.inlineFragments ?? [];
    const tooltip = fragments
        .map((f) => {
        if (f.kind === 'text') {
            const v = f.value.trim();
            return `text: ${v.length > 40 ? `${v.slice(0, 40)}…` : v}`;
        }
        const s = f.source.replace(/\s+/g, ' ').trim();
        return `jsx: ${s.length > 40 ? `${s.slice(0, 40)}…` : s}`;
    })
        .join('\n');
    return (_jsx(Tooltip, { label: tooltip || 'No raw fragments', children: _jsx("div", { className: `${styles.rowWrap} ${styles.rowRaw}`, "data-testid": "layers-row-raw", "data-parent-id": parentId, children: _jsxs("div", { className: styles.row, 
                // Same indent basis as element rows so raw fragments line up
                // with their siblings.
                style: { paddingLeft: 22 + depth * INDENT_PX, cursor: 'default' }, children: [_jsx("span", { className: styles.icon, "aria-hidden": "true", children: "\u00B6" }), _jsx("span", { className: styles.label, children: `Raw (${count})` })] }) }) }));
};
