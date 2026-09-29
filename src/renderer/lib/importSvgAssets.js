/**
 * Turn a captured inline `<svg>` back into a standalone SVG document, so
 * an import can save it as a file instead of inlining its markup.
 *
 * **Why a file.** Inline SVG has to survive two translations it cannot:
 * into JSX for the generated TSX, and back into HTML for the canvas and
 * the export. The second one is lossy in a way nothing reports. An HTML
 * parser lowercases attribute names, so React's `stopColor` becomes
 * `stopcolor`, which means nothing — a gradient's stops lose their
 * colours and the whole thing renders black. Measured on gainwix.com's
 * wordmark:
 *
 * | attribute    | parsed as    | computed stop-color |
 * |--------------|--------------|---------------------|
 * | `stop-color` | `stop-color` | rgb(10, 205, 149)   |
 * | `stopColor`  | `stopcolor`  | rgb(0, 0, 0)        |
 *
 * A `.svg` file is read by the real SVG parser. No case folding, no JSX
 * spelling, no ids shared with every other icon on the page — gradients,
 * filters, masks and clip paths all simply work, because nothing
 * rewrote them.
 *
 * The cost, stated plainly: an `<img>` cannot inherit `currentColor`, so
 * an icon that followed the text colour becomes a fixed picture. That is
 * why this is not applied to every icon — see `needsFileTreatment`.
 * see docs/notes/import-svg-as-file.md
 */
/** Attributes worth putting back on a standalone document. */
const DOCUMENT_ATTRS = ['viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'preserveAspectRatio'];
/**
 * Markup that cannot survive the inline path.
 *
 * Everything here works by internal reference (`url(#id)`) or by a
 * camelCase name the HTML parser folds. An icon with none of it is a few
 * paths and a fill, which round-trips fine and stays recolourable — so
 * it is left inline deliberately rather than turned into a flat picture.
 */
const NEEDS_FILE = /<\s*(defs|linearGradient|radialGradient|filter|mask|clipPath|pattern|use|symbol|style|foreignObject)\b/i;
export const needsFileTreatment = (svgSource) => NEEDS_FILE.test(svgSource);
/** Escape a value for an XML attribute. */
const attrValue = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
/**
 * A standalone SVG document from a captured element's attributes and
 * inner markup.
 *
 * `xmlns` is forced: an inline `<svg>` in an HTML page does not need it
 * and often omits it, and a `.svg` FILE without it will not render.
 */
export const svgDocument = (attrs, innerSource) => {
    const parts = ['xmlns="http://www.w3.org/2000/svg"'];
    for (const name of DOCUMENT_ATTRS) {
        if (name === 'xmlns')
            continue;
        const value = attrs[name];
        if (value === undefined || value.length === 0)
            continue;
        parts.push(`${name}="${attrValue(value)}"`);
    }
    return `<svg ${parts.join(' ')}>${innerSource}</svg>`;
};
/**
 * A file name for an icon, from whatever the page called it.
 *
 * The name is the only thing in the project that will say which icon a
 * file is, so a `<title>` is preferred over the element's own name —
 * `GainWix` beats `icon_0005`.
 */
export const svgAssetName = (innerSource, fallback) => {
    const title = /<title[^>]*>([^<]{1,40})<\/title>/i.exec(innerSource)?.[1];
    const raw = (title ?? fallback).trim();
    const cleaned = raw
        .replace(/[^\w\s-]+/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase();
    return cleaned.length > 0 ? cleaned.slice(0, 40) : 'icon';
};
