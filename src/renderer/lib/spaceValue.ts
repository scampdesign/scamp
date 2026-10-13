/**
 * A single "spacing" value — used for each side of padding, margin,
 * border-width, border-radius, and for the singular gap properties.
 *
 * Two forms:
 *
 *   - `number` — a plain pixel value, e.g. `16`. Emitted as `16px`.
 *   - `{ kind: 'token'; ref: string }` — a CSS `var()` reference,
 *     e.g. `{ kind: 'token', ref: 'var(--space-md)' }`. Emitted
 *     verbatim. The `ref` always includes the full `var(--name)` form.
 *
 * Why a discriminated union and not just a string? Two reasons:
 *   1. Plain px values are by far the dominant case — keeping them as
 *      numbers means existing arithmetic (defaults at 0, equality
 *      via `===`) stays cheap and existing tests stay readable.
 *   2. Forcing every side through a string forces panel code to parse
 *      `'16px'` back into a number on every render, which is wasteful
 *      and risks formatting drift.
 *
 * Old projects whose files have only px values produce `number`
 * everywhere; the union is forward-compatible. New projects whose
 * agent wrote `padding: var(--space-md)` produce token forms; the
 * generator emits them verbatim on the next save.
 */
export type SpaceValue =
  | number
  | { readonly kind: 'token'; readonly ref: string }
  /** Margins only — `margin: 0 auto` centers. Padding can't be auto. */
  | { readonly kind: 'auto' };

/** The `auto` value, for a margin side. */
export const AUTO_SPACE_VALUE: SpaceValue = { kind: 'auto' };

/**
 * Per-side tuple — same shape regardless of which CSS property it
 * lives in. Sides for padding/margin/border-width are
 * `[top, right, bottom, left]`. For border-radius they're
 * `[top-left, top-right, bottom-right, bottom-left]`. The tuple type
 * is symmetric; the property-specific ordering lives at the caller.
 */
export type SpaceTuple = readonly [SpaceValue, SpaceValue, SpaceValue, SpaceValue];

/**
 * Build a token-form `SpaceValue`. Pass the full `var(--name)` source
 * — we keep the wrapper because that's what gets emitted into CSS and
 * because token names occasionally arrive with fallbacks (`var(--x, 16px)`)
 * that we want to round-trip verbatim.
 */
export const tokenSpaceValue = (ref: string): SpaceValue => ({
  kind: 'token',
  ref,
});

/**
 * True iff `v` is a plain-px value with magnitude zero. Token values
 * are NEVER considered zero — even if they happen to resolve to `0px`
 * at runtime, an explicit `var(--…)` is a deliberate authoring
 * choice and must always emit. Used by the generator's "skip
 * default" guard so `padding: [0,0,0,0]` is omitted but `padding:
 * [var(--space-0), 0, 0, 0]` is not.
 */
export const isZeroSpaceValue = (v: SpaceValue): boolean =>
  typeof v === 'number' && v === 0;

/**
 * Structural equality for two values. Two tokens are equal iff their
 * `ref` strings match exactly (case-sensitive; whitespace inside
 * `var(...)` matters because CSS treats it as significant inside the
 * parens).
 */
export const spaceValueEquals = (a: SpaceValue, b: SpaceValue): boolean => {
  if (typeof a === 'number' || typeof b === 'number') return a === b;
  if (a.kind === 'auto' || b.kind === 'auto') return a.kind === b.kind;
  return a.ref === b.ref;
};

/** Tuple equality — element-wise structural compare. */
export const spaceTupleEquals = (
  a: SpaceTuple,
  b: SpaceTuple
): boolean =>
  spaceValueEquals(a[0], b[0]) &&
  spaceValueEquals(a[1], b[1]) &&
  spaceValueEquals(a[2], b[2]) &&
  spaceValueEquals(a[3], b[3]);

/**
 * Format a single value as the CSS source string. Numbers become
 * `Npx`; tokens emit their stored `ref` verbatim.
 */
export const formatSpaceValue = (v: SpaceValue): string =>
  typeof v === 'number' ? `${v}px` : v.kind === 'auto' ? 'auto' : v.ref;

/**
 * Format a 4-tuple as a CSS shorthand declaration value, collapsing
 * when adjacent sides match (1 / 2 / 3 / 4-value form). Mirrors how
 * a hand-written CSS file would normally write the shorthand.
 *
 * Collapse rules:
 *   - all four equal → 1 value
 *   - top===bottom AND right===left → 2 values (vertical horizontal)
 *   - right === left → 3 values (top horizontal bottom)
 *   - otherwise → 4 values
 *
 * Equality respects token vs px: `[16, 16, 16, 16]` collapses to
 * `16px`, and `[var(--m), var(--m), var(--m), var(--m)]` collapses
 * to `var(--m)`. Mixed forms (`[16, var(--m), 16, var(--m)]`)
 * collapse to a 2-value if vertical/horizontal symmetry holds.
 */
export const formatSpaceShorthand = (t: SpaceTuple): string => {
  const [a, b, c, d] = t;
  if (
    spaceValueEquals(a, b) &&
    spaceValueEquals(a, c) &&
    spaceValueEquals(a, d)
  ) {
    return formatSpaceValue(a);
  }
  if (spaceValueEquals(a, c) && spaceValueEquals(b, d)) {
    return `${formatSpaceValue(a)} ${formatSpaceValue(b)}`;
  }
  if (spaceValueEquals(b, d)) {
    return `${formatSpaceValue(a)} ${formatSpaceValue(b)} ${formatSpaceValue(c)}`;
  }
  return `${formatSpaceValue(a)} ${formatSpaceValue(b)} ${formatSpaceValue(c)} ${formatSpaceValue(d)}`;
};

/**
 * Coerce a value into a number, falling back to 0 for token forms.
 * Used by panel controls that don't yet model tokens — they show 0
 * for now and the user sees the token's effect on the canvas. The
 * panel's token picker (task #173) will replace this pattern with a
 * real two-mode input.
 */
export const spaceValueNumberOrZero = (v: SpaceValue): number =>
  typeof v === 'number' ? v : 0;

/** True iff the value is a token-form `SpaceValue`. */
export const isTokenSpaceValue = (
  v: SpaceValue
): v is { kind: 'token'; ref: string } =>
  typeof v !== 'number' && v.kind === 'token';

/** A tuple of plain zeros — used as the "no spacing" baseline. */
export const ZERO_SPACE_TUPLE: SpaceTuple = [0, 0, 0, 0];

/** True iff every side of the tuple is plain-px zero. */
export const isZeroSpaceTuple = (t: SpaceTuple): boolean =>
  isZeroSpaceValue(t[0]) &&
  isZeroSpaceValue(t[1]) &&
  isZeroSpaceValue(t[2]) &&
  isZeroSpaceValue(t[3]);

/** True iff any side is `auto` — a margin only. */
export const hasAutoSide = (t: SpaceTuple): boolean =>
  t.some((side) => typeof side !== 'number' && side.kind === 'auto');
