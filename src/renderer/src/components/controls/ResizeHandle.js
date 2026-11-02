import { jsx as _jsx } from "react/jsx-runtime";
import { useRef, useState } from 'react';
import styles from './ResizeHandle.module.css';
const KEY_STEP = 16;
/**
 * The draggable edge of a panel, also a focusable separator the arrow
 * keys move. see docs/plans/resizable-sidebar-plan.md
 */
export const ResizeHandle = ({ orientation, direction, value, min, max, onChange, onCommit, onReset, label, className, }) => {
    const drag = useRef(null);
    const frame = useRef(null);
    const [dragging, setDragging] = useState(false);
    const vertical = orientation === 'vertical';
    const sizeAt = (e, from) => from.startSize + ((vertical ? e.clientX : e.clientY) - from.start) * direction;
    const handlePointerDown = (e) => {
        if (e.button !== 0)
            return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { start: vertical ? e.clientX : e.clientY, startSize: value };
        setDragging(true);
    };
    const handlePointerMove = (e) => {
        const from = drag.current;
        if (from === null)
            return;
        const size = sizeAt(e, from);
        if (frame.current !== null)
            cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
            frame.current = null;
            onChange(size);
        });
    };
    const handlePointerUp = (e) => {
        const from = drag.current;
        if (from === null)
            return;
        drag.current = null;
        setDragging(false);
        if (frame.current !== null) {
            cancelAnimationFrame(frame.current);
            frame.current = null;
        }
        onCommit(sizeAt(e, from), from.startSize);
    };
    const handleKeyDown = (e) => {
        const deltas = vertical
            ? { ArrowLeft: -KEY_STEP, ArrowRight: KEY_STEP }
            : { ArrowUp: -KEY_STEP, ArrowDown: KEY_STEP };
        const delta = deltas[e.key];
        let next = null;
        if (delta !== undefined)
            next = value + delta * direction;
        else if (e.key === 'Home')
            next = min;
        else if (e.key === 'End')
            next = max;
        if (next === null)
            return;
        e.preventDefault();
        onCommit(Math.max(min, Math.min(max, next)), value);
    };
    return (_jsx("div", { role: "separator", tabIndex: 0, "aria-label": label, "aria-orientation": orientation, "aria-valuenow": Math.round(value), "aria-valuemin": min, "aria-valuemax": max, className: `${styles.handle} ${vertical ? styles.vertical : styles.horizontal} ${dragging ? styles.dragging : ''} ${className ?? ''}`, onPointerDown: handlePointerDown, onPointerMove: handlePointerMove, onPointerUp: handlePointerUp, onPointerCancel: handlePointerUp, onDoubleClick: onReset, onKeyDown: handleKeyDown }));
};
