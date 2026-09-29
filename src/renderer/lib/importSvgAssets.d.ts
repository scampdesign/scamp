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
export declare const needsFileTreatment: (svgSource: string) => boolean;
/**
 * A standalone SVG document from a captured element's attributes and
 * inner markup.
 *
 * `xmlns` is forced: an inline `<svg>` in an HTML page does not need it
 * and often omits it, and a `.svg` FILE without it will not render.
 */
export declare const svgDocument: (attrs: Readonly<Record<string, string>>, innerSource: string) => string;
/**
 * A file name for an icon, from whatever the page called it.
 *
 * The name is the only thing in the project that will say which icon a
 * file is, so a `<title>` is preferred over the element's own name —
 * `GainWix` beats `icon_0005`.
 */
export declare const svgAssetName: (innerSource: string, fallback: string) => string;
