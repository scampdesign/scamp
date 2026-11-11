// parsers/border.ts — split out of parsers.ts (4.3).
import { DEFAULT_RECT_STYLES } from "../defaults";
import { requireAt } from "../safeAccess";
import { parsePx } from "./common";
import { tokenizeBorder } from "./internal";
const VALID_BORDER_STYLES = new Set([
    'none',
    'solid',
    'dashed',
    'dotted',
    'double',
    'groove',
    'ridge',
    'inset',
    'outset',
]);
const isBorderStyle = (token) => token === 'none' || token === 'solid' || token === 'dashed' || token === 'dotted';
/**
 * Parse a CSS `border` shorthand into the three scamp fields.
 *
 * Tokenization is space-separated, with one wrinkle: rgb()/rgba() and similar
 * function-call colors contain spaces inside parens that are NOT separators.
 * We collapse anything inside `()` first.
 *
 * Empty input returns the documented defaults so the parser can use this
 * as a single source of truth without needing to track absence separately.
 */
export const parseBorderShorthand = (raw) => readBorder(raw).border;
/**
 * The same, or null when any part can't be held exactly: a width that
 * isn't px (`thin`, `0.1rem`), a style outside the four supported
 * (`double`), or more than one leftover token. The caller keeps the
 * value as written.
 */
export const parseBorderShorthandOrNull = (raw) => {
    const { border, clean } = readBorder(raw);
    return clean ? border : null;
};
const readBorder = (raw) => {
    const fallback = {
        borderWidth: 0,
        borderStyle: DEFAULT_RECT_STYLES.borderStyle,
        borderColor: DEFAULT_RECT_STYLES.borderColor,
    };
    if (typeof raw !== 'string')
        return { border: fallback, clean: false };
    const trimmed = raw.trim();
    if (trimmed.length === 0)
        return { border: fallback, clean: true };
    const tokens = tokenizeBorder(trimmed);
    if (tokens.length === 0)
        return { border: fallback, clean: true };
    // `border: none` (or `0`) — no border at all.
    if (tokens.length === 1) {
        const only = requireAt(tokens, 0);
        if (only === 'none' || only === '0' || only === '0px') {
            return { border: { borderWidth: 0, borderStyle: 'none', borderColor: fallback.borderColor }, clean: true };
        }
    }
    let width = null;
    let style = null;
    let color = null;
    let clean = true;
    for (const token of tokens) {
        if (width === null && /^-?\d+(?:\.\d+)?(?:px)?$/.test(token)) {
            width = parsePx(token);
            continue;
        }
        if (style === null && VALID_BORDER_STYLES.has(token)) {
            // Anything outside the supported subset collapses to `solid` so the
            // canvas still draws something visible. Round-trip preserves the
            // original via customProperties when used at the top level.
            style = isBorderStyle(token) ? token : 'solid';
            if (!isBorderStyle(token))
                clean = false;
            continue;
        }
        if (color === null) {
            color = token;
            continue;
        }
        clean = false;
    }
    // A width keyword or unit (`thin`, `0.1rem`) was taken for the color.
    if (color !== null && /^(?:thin|medium|thick|-?[\d.]+[a-z%]+)$/i.test(color))
        clean = false;
    return {
        border: {
            borderWidth: width ?? fallback.borderWidth,
            borderStyle: style ?? fallback.borderStyle,
            borderColor: color ?? fallback.borderColor,
        },
        clean,
    };
};
