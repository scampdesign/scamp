import { jsx as _jsx } from "react/jsx-runtime";
// Two brackets with a gap mark between them. Drawn on a 24×24 grid with
// `currentColor` strokes so the icon inherits the panel's text colour.
const HORIZONTAL_PATHS = [
    'M21 20H19C18.4696 20 17.9609 19.7893 17.5858 19.4142C17.2107 19.0391 17 18.5304 17 18V6C17 5.46957 17.2107 4.96086 17.5858 4.58579C17.9609 4.21071 18.4696 4 19 4H21',
    'M3 20H5C5.53043 20 6.03914 19.7893 6.41421 19.4142C6.78929 19.0391 7 18.5304 7 18V6C7 5.46957 6.78929 4.96086 6.41421 4.58579C6.03914 4.21071 5.53043 4 5 4H3',
    'M13.0049 11.995L11.0049 11.995',
];
const VERTICAL_PATHS = [
    'M4 21L4 19C4 18.4696 4.21071 17.9609 4.58579 17.5858C4.96086 17.2107 5.46957 17 6 17L18 17C18.5304 17 19.0391 17.2107 19.4142 17.5858C19.7893 17.9609 20 18.4696 20 19L20 21',
    'M4 3L4 5C4 5.53043 4.21071 6.03914 4.58579 6.41421C4.96086 6.78929 5.46957 7 6 7L18 7C18.5304 7 19.0391 6.78929 19.4142 6.41421C19.7893 6.03914 20 5.53043 20 5L20 3',
    'M12.0049 13.0049L12.0049 11.0049',
];
/**
 * The gap-direction glyph shown inside the spacing inputs in place of a
 * "Gap" text label. Horizontal for row / column-gap, vertical for
 * column / row-gap.
 */
export const GapIcon = ({ orientation, size = 16 }) => {
    const paths = orientation === 'horizontal' ? HORIZONTAL_PATHS : VERTICAL_PATHS;
    return (_jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", 
        // Match the muted colour of the old text prefix; `block` avoids the
        // inline-svg baseline gap so it centres cleanly in the input row.
        style: { display: 'block', color: 'var(--text-secondary)' }, "aria-hidden": true, children: paths.map((d) => (_jsx("path", { d: d }, d))) }));
};
