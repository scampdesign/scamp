import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEmbeddedStore } from './embeddedStore';
import { hoverTreeNode, selectTreeNode } from './session';
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
const Row = ({ node, depth, open, selected, onToggle }) => {
    const ref = useRef(null);
    const isOpen = open.has(node.id);
    const isSelected = selected === node.id;
    useEffect(() => {
        if (isSelected)
            ref.current?.scrollIntoView({ block: 'nearest' });
    }, [isSelected]);
    const firstClass = node.cls.split(' ')[0] ?? '';
    return (_jsxs(_Fragment, { children: [_jsxs("div", { ref: ref, className: styles.row, style: { paddingLeft: 6 + depth * 12 }, "aria-selected": isSelected, role: "treeitem", "aria-expanded": node.kids.length > 0 ? isOpen : undefined, onMouseEnter: () => hoverTreeNode(node.id), onMouseLeave: () => hoverTreeNode(null), onClick: () => selectTreeNode(node.id), "data-testid": "embedded-layer", "data-tag": node.tag, children: [_jsx("button", { type: "button", className: styles.twist, "aria-label": isOpen ? 'Collapse' : 'Expand', disabled: node.kids.length === 0, onClick: (e) => {
                            e.stopPropagation();
                            onToggle(node.id);
                        }, children: node.kids.length === 0 ? '' : isOpen ? '▾' : '▸' }), node.comp !== null && _jsx("span", { className: styles.comp, children: node.comp }), _jsx("span", { className: styles.tag, children: node.tag }), firstClass.length > 0 && _jsxs("span", { className: styles.cls, children: [".", firstClass] }), node.text.length > 0 && _jsx("span", { className: styles.text, children: node.text })] }), isOpen && node.kids.map((kid) => _jsx(Row, { node: kid, depth: depth + 1, open: open, selected: selected, onToggle: onToggle }, kid.id)), isOpen && node.more > 0 && (_jsxs("div", { className: styles.more, style: { paddingLeft: 18 + (depth + 1) * 12 }, children: [node.more, " more not shown"] }))] }));
};
/** The page's elements as a tree, like DevTools' Elements panel: hover to outline, click to select. */
export const LayersPanel = () => {
    const tree = useEmbeddedStore((s) => s.tree);
    const selected = useEmbeddedStore((s) => s.selection?.uid ?? null);
    const [open, setOpen] = useState(new Set());
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
    return (_jsxs("aside", { className: styles.panel, "aria-label": "Layers", "data-testid": "embedded-layers", children: [_jsx("div", { className: styles.head, children: "Layers" }), _jsx("div", { className: styles.tree, role: "tree", children: tree === null ? (_jsx("p", { className: styles.empty, children: "The page\u2019s elements appear here once it loads." })) : (_jsx(Row, { node: tree, depth: 0, open: open, selected: selected, onToggle: handleToggle })) })] }));
};
