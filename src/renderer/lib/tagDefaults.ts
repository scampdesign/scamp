import { spaceTupleEquals, type SpaceTuple } from './spaceValue';

/**
 * Per-tag overrides for properties whose browser UA-stylesheet
 * default differs from Scamp's universal `[0, 0, 0, 0]`. Without
 * these overrides, a user-authored `padding: 0` on a `<ul>` would
 * round-trip away: Scamp parses it to `[0,0,0,0]`, the generator
 * sees that as matching the rectangle default, and omits the
 * declaration — the next browser render then re-applies the UA
 * `padding-inline-start: 40px` and the user's intent is lost.
 *
 * Scope is intentionally narrow:
 *   - **Padding** on `<ul>`, `<ol>`, `<dd>`: UA sets
 *     `padding-inline-start: 40px`, which in LTR maps to
 *     `padding-left: 40px`. This is a fixed px default (not
 *     em-based), so we can model it precisely.
 *   - **Margin** is deliberately NOT modelled here. UA margin
 *     defaults for `<p>`, `<h1>`–`<h6>`, `<ul>`, etc. are
 *     em-based and computed against the actual font-size, which
 *     can differ from Scamp's 16px assumption. Approximating
 *     them as px would cause canvas/browser drift. A separate,
 *     em-aware fix is the right path when this becomes a
 *     felt problem.
 */
export const TAG_PADDING_DEFAULTS: Record<string, SpaceTuple> = {
  ul: [0, 0, 0, 40],
  ol: [0, 0, 0, 40],
  dd: [0, 0, 0, 40],
};

export const ZERO_PADDING: SpaceTuple = [0, 0, 0, 0];

/**
 * Effective padding default for an element of `tag`. Tags absent
 * from the override map use the universal `[0, 0, 0, 0]`.
 */
export const getTagDefaultPadding = (
  tag: string | undefined
): SpaceTuple => {
  if (!tag) return ZERO_PADDING;
  return TAG_PADDING_DEFAULTS[tag] ?? ZERO_PADDING;
};

/** Byte-equality on the four-tuple. Delegates to `spaceTupleEquals`
 *  so token-form values compare structurally. */
export const paddingEquals = (
  a: SpaceTuple,
  b: SpaceTuple
): boolean => spaceTupleEquals(a, b);

/**
 * Tags a browser lays out inline unless told otherwise, and that
 * Scamp's own reset does not already force to block.
 *
 * `a`, `button` and the replaced media tags are absent on purpose:
 * `theme.css` sets those to `display: block` itself, so spelling it
 * out again would be noise on every one of them.
 * see docs/notes/import-inline-spans.md
 */
export const INLINE_BY_DEFAULT: ReadonlySet<string> = new Set([
  'span', 'em', 'i', 'b', 'strong', 'u', 's', 'small', 'sub', 'sup',
  'mark', 'abbr', 'cite', 'q', 'code', 'kbd', 'samp', 'var', 'time',
  'del', 'ins', 'label', 'progress', 'meter',
]);
