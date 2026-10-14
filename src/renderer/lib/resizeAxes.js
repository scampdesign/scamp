export const ALL_RESIZE_AXES = { x: true, y: true, width: true, height: true };
/** The axes a handle (`n`, `se`, `w`, …) moves. */
export const axesForHandle = (handle) => ({
    x: handle.includes('w'),
    y: handle.includes('n'),
    width: handle.includes('e') || handle.includes('w'),
    height: handle.includes('n') || handle.includes('s'),
});
