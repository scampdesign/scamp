import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useLayoutEffect, useState } from 'react';
import styles from './GridOverlay.module.css';
import { canvasNodeById } from './canvasDom';
/**
 * Parse a resolved-style track list (e.g. `"100px 200px 100px"`) into
 * cumulative pixel offsets. Browsers always return resolved tracks as
 * a space-separated list of px values, even for `repeat()`, `1fr`,
 * `minmax()` etc., so the parsing is straightforward.
 */
const parseResolvedTracks = (raw) => {
    if (!raw || raw === 'none')
        return [];
    const tokens = raw.split(/\s+/).filter((t) => t.length > 0);
    const offsets = [];
    let cursor = 0;
    for (const token of tokens) {
        const m = token.match(/^(-?\d+(?:\.\d+)?)px$/);
        if (!m || m[1] === undefined)
            continue;
        cursor += Number(m[1]);
        offsets.push(cursor);
    }
    // The last cumulative offset is the container's content size — it's
    // also the position of the trailing edge, which we DON'T want to
    // render as an interior line. Drop it.
    if (offsets.length > 0)
        offsets.pop();
    return offsets;
};
/**
 * Dashed-line overlay that visualises the column/row tracks of a grid
 * container. Lives outside the container itself (it renders next to
 * the SelectionOverlay so it's not affected by `overflow:hidden` on
 * the grid). Position is recomputed via getComputedStyle on every
 * canvas state change + ResizeObserver.
 */
export const GridOverlay = ({ elementId, frameRect, scale, }) => {
    const [lines, setLines] = useState(null);
    useLayoutEffect(() => {
        const node = canvasNodeById(elementId);
        if (!node) {
            setLines(null);
            return;
        }
        const measure = () => {
            const computed = window.getComputedStyle(node);
            // Resolved track sizes — pixels in source order.
            const columns = parseResolvedTracks(computed.gridTemplateColumns);
            const rows = parseResolvedTracks(computed.gridTemplateRows);
            const r = node.getBoundingClientRect();
            // Translate viewport coords back into frame-local logical
            // coords. The interaction layer divides by scale the same way.
            setLines({
                columns,
                rows,
                rect: {
                    x: (r.left - frameRect.left) / scale,
                    y: (r.top - frameRect.top) / scale,
                    w: r.width / scale,
                    h: r.height / scale,
                },
            });
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(node);
        return () => ro.disconnect();
    }, [elementId, frameRect.left, frameRect.top, scale]);
    if (!lines)
        return null;
    const { rect, columns, rows } = lines;
    return (_jsxs("div", { className: styles.overlay, "data-testid": "grid-overlay", style: {
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
        }, children: [columns.map((offset, i) => (_jsx("div", { className: styles.line, style: { left: offset, top: 0, width: 0, height: rect.h } }, `c${i}`))), rows.map((offset, i) => (_jsx("div", { className: styles.line, style: { left: 0, top: offset, width: rect.w, height: 0 } }, `r${i}`)))] }));
};
