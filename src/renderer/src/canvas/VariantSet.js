import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { MAX_VARIANT_COMBINATIONS, authoredVariantGrid, variantCombinationCount, variantGrid, } from '@lib/variantAxes';
import { ElementRenderer } from './ElementRenderer';
import { IframeCanvas } from './IframeCanvas';
import { useIframeCanvasFlag } from './iframeCanvasFlag';
import { VariantFrameContext } from './variantFrame';
import styles from './VariantSet.module.css';
const EMPTY_AXES = [];
/**
 * Figma's component set: every variant of the component as a frame,
 * the first axis down the rows and the second across. The frame being
 * edited is live where it sits; the others are read-only renders, and
 * clicking one makes it live (`variantCellAt` in the interaction
 * layer). Each frame hugs the component, except along an axis where the
 * root fills its container, which takes the artboard's size.
 * see docs/plans/component-variants-plan.md, phase 6
 */
export const VariantSet = ({ componentName, artboardWidth, artboardHeight, onWidth }) => {
    const axes = useCanvasStore((s) => s.elements[ROOT_ELEMENT_ID]?.variantAxes ?? EMPTY_AXES);
    const fillsWidth = useCanvasStore((s) => s.elements[ROOT_ELEMENT_ID]?.widthMode === 'stretch');
    const fillsHeight = useCanvasStore((s) => s.elements[ROOT_ELEMENT_ID]?.heightMode === 'stretch');
    const activeVariantKey = useCanvasStore((s) => s.activeVariantKey);
    const iframeFlag = useIframeCanvasFlag((s) => s.on);
    const count = variantCombinationCount(axes);
    const overCap = count > MAX_VARIANT_COMBINATIONS;
    // Only past the cap does the layout read the overrides, so only then
    // does every element edit re-lay out the set.
    const elements = useCanvasStore((s) => (overCap ? s.elements : null));
    const blocks = useMemo(() => (elements !== null ? authoredVariantGrid(elements, activeVariantKey) : variantGrid(axes)), [axes, elements, activeVariantKey]);
    const setRef = useRef(null);
    const frameRefs = useRef(new Map());
    const [reach, setReach] = useState({});
    // A root with only absolutely placed children is 0 tall, and what's
    // drawn hangs outside its frame. Each frame is sized to reach its
    // furthest element, measured after every render; the state only
    // changes when a reach does. It's measured with the min sizes off: a
    // root that follows its frame (`auto`, a %) would otherwise grow with
    // them, push what hangs past it further, and loop forever (React #185).
    useLayoutEffect(() => {
        const next = {};
        const frames = [...frameRefs.current.values()];
        const held = frames.map((frame) => [frame.style.minWidth, frame.style.minHeight]);
        for (const frame of frames) {
            frame.style.minWidth = '';
            frame.style.minHeight = '';
        }
        for (const [key, frame] of frameRefs.current) {
            const rect = frame.getBoundingClientRect();
            const scale = frame.offsetWidth > 0 ? rect.width / frame.offsetWidth : 1;
            let w = 0;
            let h = 0;
            for (const node of frame.querySelectorAll('[data-scamp-id]')) {
                const r = node.getBoundingClientRect();
                if (r.width === 0 && r.height === 0)
                    continue;
                // A closed menu's panel is there but hidden: the frame hugs what shows.
                if (getComputedStyle(node).visibility === 'hidden')
                    continue;
                w = Math.max(w, Math.ceil((r.right - rect.left) / scale));
                h = Math.max(h, Math.ceil((r.bottom - rect.top) / scale));
            }
            next[key] = { w, h };
        }
        frames.forEach((frame, i) => {
            [frame.style.minWidth, frame.style.minHeight] = held[i] ?? ['', ''];
        });
        const same = Object.keys(next).length === Object.keys(reach).length &&
            Object.entries(next).every(([k, v]) => reach[k]?.w === v.w && reach[k]?.h === v.h);
        if (!same)
            setReach(next);
    });
    useLayoutEffect(() => {
        const node = setRef.current;
        if (!node)
            return;
        const report = () => onWidth(node.offsetWidth);
        report();
        const ro = new ResizeObserver(report);
        ro.observe(node);
        return () => ro.disconnect();
    }, [onWidth]);
    // A frame picked in the Variants section can be off screen, or (past
    // the cap) new at the end of the set: bring it into view.
    useEffect(() => {
        const cell = setRef.current?.querySelector('[data-variant-live="true"]');
        cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [activeVariantKey]);
    const renderCell = (cell) => {
        const live = cell.key === activeVariantKey;
        const id = cell.key ?? '';
        return (_jsxs("div", { className: `${styles.cell} ${live ? styles.cellLive : ''}`, "data-variant-cell": cell.key ?? '', "data-variant-live": live ? 'true' : 'false', children: [_jsxs("div", { className: styles.label, title: axes.map((a) => `${a.prop}: ${cell.picks[a.prop]}`).join(', '), children: [cell.label, cell.key === null && _jsx("span", { className: styles.defaultTag, children: "default" })] }), _jsx("div", { ref: (node) => {
                        if (node === null)
                            frameRefs.current.delete(id);
                        else
                            frameRefs.current.set(id, node);
                    }, className: styles.frame, "data-variant-frame": true, style: {
                        width: fillsWidth ? `${artboardWidth}px` : 'max-content',
                        height: fillsHeight ? `${artboardHeight}px` : undefined,
                        // Not along a side the root fills: growing the frame would grow
                        // the root, move what hangs past it, and grow the frame again.
                        minWidth: reach[id] !== undefined && !fillsWidth ? `${reach[id].w}px` : undefined,
                        minHeight: reach[id] !== undefined && !fillsHeight ? `${reach[id].h}px` : undefined,
                    }, children: iframeFlag ? (_jsx(IframeCanvas, { viewportHeight: artboardHeight, variant: { key: cell.key, live, hugWidth: !fillsWidth, hugHeight: !fillsHeight } })) : (_jsx(VariantFrameContext.Provider, { value: { variantKey: cell.key, displayOnly: !live }, children: _jsx(ElementRenderer, { elementId: ROOT_ELEMENT_ID }) })) })] }, cell.key ?? 'default'));
    };
    return (_jsxs("div", { ref: setRef, className: styles.set, "data-testid": "variant-set", children: [_jsx("div", { className: styles.name, children: componentName }), overCap && (_jsxs("div", { className: styles.notice, role: "note", "data-testid": "variant-set-notice", children: [componentName, " has ", count.toLocaleString('en-US'), " combinations, more than the", ' ', MAX_VARIANT_COMBINATIONS, " the canvas can show. It shows each value on its own and each combination that has its own styles. To show another combination, select its values in the Variants section."] })), blocks.map((block, b) => (_jsxs("div", { className: styles.block, children: [block.heading !== null && _jsx("div", { className: styles.heading, children: block.heading }), block.rows.map((row, r) => (_jsx("div", { className: styles.row, children: row.map(renderCell) }, r)))] }, block.heading ?? b)))] }));
};
