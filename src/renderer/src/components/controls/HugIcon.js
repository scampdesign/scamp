import { jsx as _jsx } from "react/jsx-runtime";
// Inward-pointing arrows meeting a centre bar — "hug contents". Drawn on
// a 24×24 grid with `currentColor` strokes so it inherits panel colour.
const HORIZONTAL_PATHS = [
    'M6 15L9 12L6 9',
    'M3 12L9 12',
    'M18 9L15 12L18 15',
    'M15 12L21 12',
    'M12 8V16',
];
const VERTICAL_PATHS = [
    'M9 6L12 9L15 6',
    'M12 3V9',
    'M16 12L8 12',
    'M15 18L12 15L9 18',
    'M12 15V21',
];
/**
 * The "hug contents" glyph for the Size type picker — horizontal for the
 * width axis, vertical for the height axis.
 */
export const HugIcon = ({ orientation, size = 16 }) => {
    const paths = orientation === 'horizontal' ? HORIZONTAL_PATHS : VERTICAL_PATHS;
    return (_jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", style: { display: 'block' }, "aria-hidden": true, children: paths.map((d) => (_jsx("path", { d: d }, d))) }));
};
