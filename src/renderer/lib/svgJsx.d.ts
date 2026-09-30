/**
 * Turn captured SVG markup into markup React will accept.
 *
 * `svgSource` is the DOM's own serialisation of an icon's innards, and
 * it is emitted into a `.tsx` file verbatim. The DOM writes HTML:
 * `style` is a string, and presentation attributes keep their hyphens.
 * React takes neither. The result was icons that rendered black —
 * `style="fill: currentcolor"` was captured correctly and then thrown
 * away by the renderer — and files React refused outright.
 *
 * Converting here rather than in the generator keeps it to imported
 * markup: a hand-written `<svg>` already contains JSX and must be
 * emitted byte-for-byte, which is the contract `svgSource` promises.
 * see docs/notes/import-svg-jsx.md
 */
/** `stroke-width` → `strokeWidth`; `data-x` and `aria-x` keep their hyphens. */
export declare const jsxAttributeName: (name: string) => string;
/** `fill: none; stroke-width: 2` → `{fill: 'none', strokeWidth: '2'}` source. */
export declare const jsxStyleObject: (declarations: string) => string;
/**
 * Convert a run of captured SVG markup to JSX.
 *
 * Idempotent: markup that is already JSX comes back unchanged, which
 * matters because the source round-trips through `parseCode` and is
 * converted again on every save.
 */
export declare const svgSourceToJsx: (source: string) => string;
/**
 * Convert JSX SVG markup back to HTML.
 *
 * `svgSource` is stored as JSX because it is emitted into a `.tsx` file
 * and a hand-written `<svg>` already contains JSX — that is the contract
 * the field promises. But TWO consumers are not React: the canvas
 * injects it with `dangerouslySetInnerHTML`, and `buildHtmlExport`
 * writes it into an HTML document. Both were rendering JSX as HTML,
 * where it silently means something else.
 *
 * Three bugs came from that one gap, each found separately: `stopColor`
 * read as `stopcolor` and gradients rendered black; camelCase tag names,
 * saved only by the HTML parser's own fix-up table; and `style={{ … }}`
 * read as an attribute whose value is `{{`, which turned every line icon
 * into a solid black blob.
 *
 * Idempotent, like its inverse: markup that is already HTML comes back
 * unchanged. see docs/notes/import-parity-log.md
 */
export declare const svgSourceToHtml: (source: string) => string;
