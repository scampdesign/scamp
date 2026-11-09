import { createElement as _createElement } from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { liftInTree } from '@lib/embeddedTree';
import { useEmbeddedStore } from './embeddedStore';
import { hoverTreeNode, moveTreeNode, selectTreeNode } from './session';
import styles from './LayersPanel.module.css';
/** Levels a new page opens to: past body and the app's root, to its own layout. */
const OPEN_DEPTH = 4;
/** Ids from the root down to `id`, or null when it isn't in the tree. */
const pathTo = (node, id) => {
    if (node.id === id)
        return [node.id];
    for (const kid of node.kids) {
        const below = pathTo(kid, id);
        if (below !== null)
            return [node.id, ...below];
    }
    return null;
};
const Row = (props) => {
    const { node, parentId, depth, open, selected, onToggle, drag, over } = props;
    const ref = useRef(null);
    const isOpen = open.has(node.id);
    const isSelected = selected === node.id;
    useEffect(() => {
        if (isSelected)
            ref.current?.scrollIntoView({ block: 'nearest' });
    }, [isSelected]);
    const firstClass = node.cls.split(' ')[0] ?? '';
    return (_jsxs(_Fragment, { children: [_jsxs("div", { ref: ref, className: styles.row, style: { paddingLeft: 6 + depth * 12 }, "aria-selected": isSelected, role: "treeitem", "aria-expanded": node.kids.length > 0 ? isOpen : undefined, onMouseEnter: () => hoverTreeNode(node.id), onMouseLeave: () => hoverTreeNode(null), onClick: () => selectTreeNode(node.id), draggable: parentId !== null, onDragStart: (e) => {
                    if (parentId === null || !props.onDragStart(node.id)) {
                        e.preventDefault();
                        return;
                    }
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', node.id);
                }, onDragOver: (e) => {
                    // Only among siblings: moving into another parent isn't supported yet.
                    if (drag === null || drag.parent !== parentId || drag.id === node.id)
                        return;
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    props.onDragOver({ id: node.id, position: e.clientY < r.top + r.height / 2 ? 'before' : 'after' });
                }, onDragLeave: () => {
                    if (over?.id === node.id)
                        props.onDragOver(null);
                }, onDrop: (e) => {
                    e.preventDefault();
                    props.onDrop();
                }, onDragEnd: props.onDragEnd, "data-drop": over?.id === node.id ? over.position : undefined, "data-testid": "embedded-layer", "data-tag": node.tag, children: [_jsx("button", { type: "button", className: styles.twist, "aria-label": isOpen ? 'Collapse' : 'Expand', disabled: node.kids.length === 0, onClick: (e) => {
                            e.stopPropagation();
                            onToggle(node.id);
                        }, children: node.kids.length === 0 ? '' : isOpen ? '▾' : '▸' }), node.comp !== null && _jsx("span", { className: styles.comp, children: node.comp }), _jsx("span", { className: styles.tag, children: node.tag }), firstClass.length > 0 && _jsxs("span", { className: styles.cls, children: [".", firstClass] }), node.text.length > 0 && _jsx("span", { className: styles.text, children: node.text })] }), isOpen && node.kids.map((kid) => _createElement(Row, { ...props, key: kid.id, node: kid, parentId: node.id, depth: depth + 1 })), isOpen && node.more > 0 && (_jsxs("div", { className: styles.more, style: { paddingLeft: 18 + (depth + 1) * 12 }, children: [node.more, " more not shown"] }))] }));
};
/** The page's elements as a tree, like DevTools' Elements panel: hover to outline, click to select. */
export const LayersPanel = () => {
    const tree = useEmbeddedStore((s) => s.tree);
    const selected = useEmbeddedStore((s) => s.selection?.uid ?? null);
    const [open, setOpen] = useState(new Set());
    const [drag, setDrag] = useState(null);
    const [over, setOver] = useState(null);
    const [note, setNote] = useState(null);
    const handleDragStart = (id) => {
        if (tree === null)
            return false;
        const lifted = liftInTree(tree, id);
        setNote(lifted === null
            ? 'This layer and the ones around it have no siblings to move between.'
            : lifted.id !== id
                ? 'Moving the layer around it: this one has no siblings.'
                : null);
        setDrag(lifted);
        return lifted !== null;
    };
    const path = useMemo(() => (tree === null || selected === null ? null : pathTo(tree, selected)), [tree, selected]);
    // Open the way down to the selection, and the first levels of a new page.
    useEffect(() => {
        if (tree === null)
            return;
        setOpen((was) => {
            const next = new Set(was);
            const openTop = (node, depth) => {
                if (depth >= OPEN_DEPTH)
                    return;
                next.add(node.id);
                for (const kid of node.kids)
                    openTop(kid, depth + 1);
            };
            openTop(tree, 0);
            for (const id of path?.slice(0, -1) ?? [])
                next.add(id);
            return next;
        });
    }, [tree, path]);
    const handleToggle = (id) => {
        setOpen((was) => {
            const next = new Set(was);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            return next;
        });
    };
    return (_jsxs("aside", { className: styles.panel, "aria-label": "Layers", "data-testid": "embedded-layers", children: [_jsx("div", { className: styles.head, children: "Layers" }), _jsx("div", { className: styles.tree, role: "tree", children: tree === null ? (_jsx("p", { className: styles.empty, children: "The page\u2019s elements appear here once it loads." })) : (_jsx(Row, { node: tree, parentId: null, depth: 0, open: open, selected: selected, onToggle: handleToggle, drag: drag, over: over, onDragStart: handleDragStart, onDragOver: setOver, onDrop: () => {
                        if (drag !== null && over !== null)
                            moveTreeNode(drag.id, over.id, over.position);
                        setDrag(null);
                        setOver(null);
                    }, onDragEnd: () => {
                        setDrag(null);
                        setOver(null);
                    } })) }), note !== null && (_jsx("p", { className: styles.note, role: "status", "data-testid": "embedded-layers-note", children: note }))] }));
};
