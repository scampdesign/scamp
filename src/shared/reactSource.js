/**
 * Names a React app's source gives a list: `navItems.map((item) => …)`
 * says the list is `navItems` and a row is an `item`. React hands the
 * import a JSX call site — file, line, column — inside the callback; the
 * `.map(` is on that line or a few above it.
 *
 * Pure: the caller reads the file. Used by main for the import and by
 * the eval script.
 * see docs/plans/react-import-plan.md
 */
/** `/src/app/nav.tsx:102:72` → its parts, or null. */
export const parseCallSite = (site) => {
    const m = site.match(/^(.*):(\d+):(\d+)$/);
    if (m === null || m[1] === undefined || m[1].length === 0)
        return null;
    return { path: m[1], line: Number(m[2]), column: Number(m[3]) };
};
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/**
 * The list and row names of the nearest `.map(` before the call site,
 * looking back at most `lookBack` lines. Null when there's none, or when
 * the callback destructures its row (`({ id, label }) =>`), which names
 * no row.
 */
export const listNamesAt = (lines, site, lookBack = 6) => {
    const last = site.line - 1;
    if (last < 0 || last >= lines.length)
        return null;
    const first = Math.max(0, last - lookBack);
    const text = [...lines.slice(first, last), (lines[last] ?? '').slice(0, Math.max(0, site.column - 1))].join('\n');
    const calls = [...text.matchAll(/([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*)\s*\??\.\s*map\s*\(\s*(?:\(\s*)?([A-Za-z_$][\w$]*)?/g)];
    const call = calls.at(-1);
    if (call === undefined)
        return null;
    // `data.items.map` names the list after its last part; `?.` is noise.
    const raw = (call[1] ?? '').split(/\??\./).at(-1) ?? '';
    // A constant (`RECEIVED_RANGES`) becomes a prop name: `receivedRanges`.
    const over = /^[A-Z0-9_]+$/.test(raw) && raw.includes('_')
        ? raw.toLowerCase().replace(/_+([a-z0-9])/g, (_m, c) => c.toUpperCase())
        : raw;
    const as = call[2] ?? '';
    if (!IDENTIFIER.test(over) || !IDENTIFIER.test(as))
        return null;
    return { over, as };
};
