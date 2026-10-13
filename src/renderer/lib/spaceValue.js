/** The `auto` value, for a margin side. */
export const AUTO_SPACE_VALUE = { kind: 'auto' };
/**
 * Build a token-form `SpaceValue`. Pass the full `var(--name)` source
 * — we keep the wrapper because that's what gets emitted into CSS and
 * because token names occasionally arrive with fallbacks (`var(--x, 16px)`)
 * that we want to round-trip verbatim.
 */
export const tokenSpaceValue = (ref) => ({
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
export const isZeroSpaceValue = (v) => typeof v === 'number' && v === 0;
/**
 * Structural equality for two values. Two tokens are equal iff their
 * `ref` strings match exactly (case-sensitive; whitespace inside
 * `var(...)` matters because CSS treats it as significant inside the
 * parens).
 */
export const spaceValueEquals = (a, b) => {
    if (typeof a === 'number' || typeof b === 'number')
        return a === b;
    if (a.kind === 'auto' || b.kind === 'auto')
        return a.kind === b.kind;
    return a.ref === b.ref;
};
/** Tuple equality — element-wise structural compare. */
export const spaceTupleEquals = (a, b) => spaceValueEquals(a[0], b[0]) &&
    spaceValueEquals(a[1], b[1]) &&
    spaceValueEquals(a[2], b[2]) &&
    spaceValueEquals(a[3], b[3]);
/**
 * Format a single value as the CSS source string. Numbers become
 * `Npx`; tokens emit their stored `ref` verbatim.
 */
export const formatSpaceValue = (v) => typeof v === 'number' ? `${v}px` : v.kind === 'auto' ? 'auto' : v.ref;
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
export const formatSpaceShorthand = (t) => {
    const [a, b, c, d] = t;
    if (spaceValueEquals(a, b) &&
        spaceValueEquals(a, c) &&
        spaceValueEquals(a, d)) {
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
export const spaceValueNumberOrZero = (v) => typeof v === 'number' ? v : 0;
/** True iff the value is a token-form `SpaceValue`. */
export const isTokenSpaceValue = (v) => typeof v !== 'number' && v.kind === 'token';
/** A tuple of plain zeros — used as the "no spacing" baseline. */
export const ZERO_SPACE_TUPLE = [0, 0, 0, 0];
/** True iff every side of the tuple is plain-px zero. */
export const isZeroSpaceTuple = (t) => isZeroSpaceValue(t[0]) &&
    isZeroSpaceValue(t[1]) &&
    isZeroSpaceValue(t[2]) &&
    isZeroSpaceValue(t[3]);
/** True iff any side is `auto` — a margin only. */
export const hasAutoSide = (t) => t.some((side) => typeof side !== 'number' && side.kind === 'auto');
