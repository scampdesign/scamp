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
export const jsxAttributeName = (name) => {
    const lower = name.toLowerCase();
    if (lower.startsWith('data-') || lower.startsWith('aria-'))
        return lower;
    // `xlink:href` and friends: React spells the namespace in too.
    const flat = lower.replace(/:/g, '-');
    // Nothing to change: hand the name back AS WRITTEN. Lowercasing here
    // un-camel-cased `strokeWidth` on the second pass, and the source is
    // converted again on every save.
    if (!flat.includes('-'))
        return NON_HYPHEN_ATTRIBUTES[flat] ?? name;
    return flat.replace(/-([a-z])/g, (_m, c) => (c ?? '').toUpperCase());
};
/**
 * Attributes React spells differently for reasons other than hyphens.
 * `datetime` is the one that turns up in real pages; the rest are here
 * because leaving them out would be an arbitrary place to stop.
 */
const NON_HYPHEN_ATTRIBUTES = {
    datetime: 'dateTime',
    class: 'className',
    for: 'htmlFor',
    tabindex: 'tabIndex',
    readonly: 'readOnly',
    maxlength: 'maxLength',
    colspan: 'colSpan',
    rowspan: 'rowSpan',
    viewbox: 'viewBox',
    preserveaspectratio: 'preserveAspectRatio',
    gradienttransform: 'gradientTransform',
    gradientunits: 'gradientUnits',
    patternunits: 'patternUnits',
    spreadmethod: 'spreadMethod',
    stopcolor: 'stopColor',
    stopopacity: 'stopOpacity',
    textlength: 'textLength',
    lengthadjust: 'lengthAdjust',
    markerwidth: 'markerWidth',
    markerheight: 'markerHeight',
    markerunits: 'markerUnits',
    refx: 'refX',
    refy: 'refY',
};
/** `fill: none; stroke-width: 2` → `{fill: 'none', strokeWidth: '2'}` source. */
export const jsxStyleObject = (declarations) => {
    const pairs = [];
    for (const chunk of declarations.split(';')) {
        const at = chunk.indexOf(':');
        if (at < 0)
            continue;
        const prop = chunk.slice(0, at).trim().toLowerCase();
        const value = chunk.slice(at + 1).trim();
        if (prop.length === 0 || value.length === 0)
            continue;
        // A custom property keeps its name and has to be quoted as a key.
        const key = prop.startsWith('--')
            ? `'${prop}'`
            : prop.replace(/-([a-z])/g, (_m, c) => (c ?? '').toUpperCase());
        pairs.push(`${key}: '${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`);
    }
    return `{{ ${pairs.join(', ')} }}`;
};
/** Every attribute in a tag, tolerating single, double and bare values. */
const ATTRIBUTE = /([:A-Za-z_][-:.\w]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>`=]+)/g;
/**
 * Rewrite one tag's attributes. Anything that is already a JSX
 * expression (`{...}`) is left exactly as it is, so re-running this on
 * markup it has already converted changes nothing.
 */
const convertTag = (tag) => tag.replace(ATTRIBUTE, (whole, rawName, rawValue) => {
    const quoted = rawValue.startsWith('"') || rawValue.startsWith("'");
    const value = quoted ? rawValue.slice(1, -1) : rawValue;
    if (rawValue.startsWith('{'))
        return whole;
    const name = jsxAttributeName(rawName);
    if (name === 'style')
        return `style=${jsxStyleObject(value)}`;
    return `${name}="${value.replace(/"/g, '&quot;')}"`;
});
/**
 * Convert a run of captured SVG markup to JSX.
 *
 * Idempotent: markup that is already JSX comes back unchanged, which
 * matters because the source round-trips through `parseCode` and is
 * converted again on every save.
 */
export const svgSourceToJsx = (source) => source.replace(/<[A-Za-z][^>]*>/g, (tag) => convertTag(tag));
/**
 * SVG attributes that are genuinely camelCase IN THE MARKUP.
 *
 * The inverse of `jsxAttributeName` cannot simply un-camel every name:
 * `strokeWidth` came from `stroke-width` and has to go back, but
 * `viewBox` and `gradientUnits` are spelled that way in SVG itself and
 * lowercasing them breaks the attribute. The rule needs to know which
 * is which, and only a list can tell it.
 */
const CAMEL_SVG_ATTRIBUTES = new Set([
    'viewBox', 'preserveAspectRatio', 'gradientTransform', 'gradientUnits',
    'patternUnits', 'patternContentUnits', 'patternTransform', 'spreadMethod',
    'textLength', 'lengthAdjust', 'markerWidth', 'markerHeight', 'markerUnits',
    'refX', 'refY', 'clipPathUnits', 'maskUnits', 'maskContentUnits',
    'filterUnits', 'primitiveUnits', 'startOffset', 'pathLength',
    'baseFrequency', 'numOctaves', 'stitchTiles', 'xChannelSelector',
    'yChannelSelector', 'tableValues', 'kernelMatrix', 'diffuseConstant',
    'specularConstant', 'specularExponent', 'surfaceScale', 'stdDeviation',
    'attributeName', 'repeatCount', 'keyTimes', 'keySplines', 'calcMode',
]);
/** React spellings that are NOT camelCase in HTML. */
const HTML_SPELLING = {
    className: 'class',
    htmlFor: 'for',
    dateTime: 'datetime',
    tabIndex: 'tabindex',
    readOnly: 'readonly',
    maxLength: 'maxlength',
    colSpan: 'colspan',
    rowSpan: 'rowspan',
};
/** The inverse of `jsxAttributeName`. `strokeWidth` → `stroke-width`. */
const htmlAttributeName = (name) => {
    const spelled = HTML_SPELLING[name];
    if (spelled !== undefined)
        return spelled;
    if (CAMEL_SVG_ATTRIBUTES.has(name))
        return name;
    if (name.startsWith('data-') || name.startsWith('aria-'))
        return name;
    // Already hyphenated or a single lowercase word: nothing to undo.
    if (!/[A-Z]/.test(name))
        return name;
    return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
};
/** `{{ fill: 'none', strokeWidth: '2' }}` → `fill: none; stroke-width: 2`. */
const htmlStyleString = (expression) => {
    const body = expression.replace(/^\{\{/, '').replace(/\}\}$/, '');
    const out = [];
    for (const pair of body.matchAll(/(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
        const key = pair[1] ?? pair[2] ?? pair[3] ?? '';
        const value = (pair[4] ?? pair[5] ?? '').replace(/\\(['"\\])/g, '$1');
        if (key.length === 0)
            continue;
        const prop = key.startsWith('--') ? key : htmlAttributeName(key);
        out.push(`${prop}: ${value}`);
    }
    return out.join('; ');
};
const convertTagToHtml = (tag) => tag
    // `style={{ … }}` first: its value contains quotes and colons that
    // the attribute pattern below would misread.
    .replace(/\bstyle\s*=\s*\{\{[\s\S]*?\}\}/g, (whole) => {
    const declarations = htmlStyleString(whole.slice(whole.indexOf('{')));
    return declarations.length === 0 ? '' : `style="${declarations.replace(/"/g, '&quot;')}"`;
})
    .replace(ATTRIBUTE, (whole, rawName, rawValue) => {
    if (rawValue.startsWith('{'))
        return whole;
    const quoted = rawValue.startsWith('"') || rawValue.startsWith("'");
    const value = quoted ? rawValue.slice(1, -1) : rawValue;
    return `${htmlAttributeName(rawName)}="${value.replace(/"/g, '&quot;')}"`;
});
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
export const svgSourceToHtml = (source) => source.replace(/<[A-Za-z][^>]*>/g, (tag) => convertTagToHtml(tag));
