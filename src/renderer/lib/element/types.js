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
/** The `variantOverrides` key for one axis value. */
export const variantKey = (axis, value) => `${axis}=${value}`;
/** A variant axis name: a prop, and a `data-` attribute suffix CSS matches lowercase. */
export const VARIANT_AXIS_RE = /^[a-z][a-z0-9]*$/;
/** A variant value: a CSS attribute value and a TypeScript string literal. */
export const VARIANT_VALUE_RE = /^[a-z][a-z0-9-]*$/;
/**
 * Whether `parts` are non-default values of `axes`, one per axis, in axis
 * order: the shape of a key the generator writes and the parser places.
 */
export const variantPartsLive = (axes, parts) => {
    let previous = -1;
    for (const part of parts) {
        const index = axes.findIndex((a) => a.prop === part.axis);
        const axis = axes[index];
        if (axis === undefined || index <= previous || !axis.values.includes(part.value) || axis.defaultValue === part.value)
            return false;
        previous = index;
    }
    return parts.length > 0;
};
/** The key for a combination, parts in axis order: `variant=outline&size=small`. */
export const variantComboKey = (parts) => parts.map((p) => variantKey(p.axis, p.value)).join('&');
/** A key's parts, or null when one isn't `axis=value`. */
export const variantKeyParts = (key) => {
    const parts = [];
    for (const part of key.split('&')) {
        const at = part.indexOf('=');
        if (at <= 0 || at === part.length - 1)
            return null;
        parts.push({ axis: part.slice(0, at), value: part.slice(at + 1) });
    }
    return parts;
};
/** Each subset of `items` with `size` members, in index order. */
const subsetsOf = (items, size) => {
    if (size === 0)
        return [[]];
    const out = [];
    items.forEach((item, i) => {
        for (const rest of subsetsOf(items.slice(i + 1), size - 1))
            out.push([item, ...rest]);
    });
    return out;
};
/**
 * Every key whose rule applies when these values are picked (one per
 * axis, in axis order): each single value, then each pair, and so on,
 * in the order their rules are written. A later rule wins a tie, so
 * layering in this order matches the browser. CONTRACT.md §1.3.1
 */
export const keysCovering = (picks) => {
    const out = [];
    for (let size = 1; size <= picks.length; size += 1) {
        for (const subset of subsetsOf(picks, size))
            out.push(variantComboKey(subset));
    }
    return out;
};
/** Every key the axes allow, in the order their rules are written. */
export const orderedVariantKeys = (axes) => {
    const choices = axes.map((axis) => axis.values.filter((v) => v !== axis.defaultValue).map((value) => ({ axis: axis.prop, value })));
    const out = [];
    for (let size = 1; size <= axes.length; size += 1) {
        for (const subset of subsetsOf(choices, size)) {
            let tuples = [[]];
            for (const options of subset)
                tuples = tuples.flatMap((t) => options.map((o) => [...t, o]));
            for (const tuple of tuples)
                out.push(variantComboKey(tuple));
        }
    }
    return out;
};
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
