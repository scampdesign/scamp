/**
 * Canonical canvas element type. Mirrors the Element shape from prd-scamp-poc.md
 * §"Zustand State Shape". Both `generateCode` and `parseCode` (added in M3)
 * operate on a flat `Record<string, ScampElement>` keyed by id.
 */
export const SVG_SRC_ATTR = 'data-scamp-svg-src';
export const ELEMENT_STATES = [
    'hover',
    'active',
    'focus',
];
/**
 * The id used for the implicit page-root element. Stays constant across
 * all pages so other code can rely on a known anchor.
 */
export const ROOT_ELEMENT_ID = 'root';
/**
 * `src` and `alt` on a real `<img>` are typed fields, not entries in the
 * attribute bag — so "where does this bound attribute's sample live?"
 * has two answers, and every reader and writer has to ask.
 * see docs/notes/view-bindings.md
 */
const TYPED_IMG_ATTRS = new Set(['src', 'alt']);
/**
 * True when this element keeps `src` / `alt` in the typed fields. Other
 * image-family tags (video, iframe, svg) keep theirs in the bag: `alt`
 * is invalid on them and `src` has tag-specific semantics. The tag is
 * absent when it's the type's default, which for an image is `img`.
 */
export const hasTypedSrcAlt = (el) => el.type === 'image' && (el.tag ?? 'img') === 'img';
/** Where this attribute's sample lives on this element, if it has one. */
export const attributeSample = (el, attr) => hasTypedSrcAlt(el) && TYPED_IMG_ATTRS.has(attr)
    ? attr === 'src'
        ? el.src
        : el.alt
    : el.attributes?.[attr];
/** The element with this attribute's sample set, wherever it belongs. */
export const withAttributeSample = (el, attr, value) => hasTypedSrcAlt(el) && TYPED_IMG_ATTRS.has(attr)
    ? { ...el, [attr]: value }
    : { ...el, attributes: { ...(el.attributes ?? {}), [attr]: value } };
