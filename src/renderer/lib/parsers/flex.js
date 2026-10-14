/**
 * The `flex` shorthand, expanded to its three longhands.
 *
 * Agents and humans write `flex: 1` and `flex: none` far more often than
 * the longhands, so the parser has to read the shorthand. The generator
 * only ever writes longhands — see docs/archive/2026-09-04-flex-controls-plan.md,
 * open question 1 — so this is one-directional by design.
 */
const NUMBER = /^-?(?:\d+|\d*\.\d+)$/;
const isNonNegativeNumber = (token) => NUMBER.test(token) && Number(token) >= 0;
/** A `<'flex-basis'>` token: a length, a percentage, or a sizing keyword. */
const isBasis = (token) => /^(?:auto|content|max-content|min-content|fit-content)$/.test(token) ||
    /^-?(?:\d+|\d*\.\d+)(?:px|%|r?em|vh|vw|vmin|vmax|ch|ex|cm|mm|in|pt|pc)$/.test(token) ||
    /^(?:calc|var|min|max|clamp)\(.*\)$/.test(token) ||
    token === '0';
const basisOrEmpty = (token) => (token === 'auto' ? '' : token);
/**
 * Returns `null` for anything it can't reduce, so the declaration is
 * preserved verbatim in `customProperties` instead of being misread.
 */
export const parseFlexShorthand = (value) => {
    const raw = value.trim();
    if (raw.length === 0)
        return null;
    const lower = raw.toLowerCase();
    if (lower === 'none')
        return { flexGrow: 0, flexShrink: 0, flexBasis: '' };
    if (lower === 'auto')
        return { flexGrow: 1, flexShrink: 1, flexBasis: '' };
    if (lower === 'initial')
        return { flexGrow: 0, flexShrink: 1, flexBasis: '' };
    const tokens = raw.split(/\s+/);
    if (tokens.length === 1) {
        const [t] = tokens;
        if (t === undefined)
            return null;
        // A unitless number is grow; per spec basis then defaults to 0%.
        if (isNonNegativeNumber(t)) {
            return { flexGrow: Number(t), flexShrink: 1, flexBasis: '0%' };
        }
        if (isBasis(t))
            return { flexGrow: 1, flexShrink: 1, flexBasis: basisOrEmpty(t) };
        return null;
    }
    if (tokens.length === 2) {
        const [a, b] = tokens;
        if (a === undefined || b === undefined)
            return null;
        if (!isNonNegativeNumber(a))
            return null;
        if (isNonNegativeNumber(b)) {
            return { flexGrow: Number(a), flexShrink: Number(b), flexBasis: '0%' };
        }
        if (isBasis(b))
            return { flexGrow: Number(a), flexShrink: 1, flexBasis: basisOrEmpty(b) };
        return null;
    }
    if (tokens.length === 3) {
        const [a, b, c] = tokens;
        if (a === undefined || b === undefined || c === undefined)
            return null;
        if (!isNonNegativeNumber(a) || !isNonNegativeNumber(b) || !isBasis(c))
            return null;
        return { flexGrow: Number(a), flexShrink: Number(b), flexBasis: basisOrEmpty(c) };
    }
    return null;
};
