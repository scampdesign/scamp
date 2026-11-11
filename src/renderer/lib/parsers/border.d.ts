import { type BorderStyle } from "../element";
export type ParsedBorder = {
    borderWidth: number;
    borderStyle: BorderStyle;
    borderColor: string;
};
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
export declare const parseBorderShorthand: (raw: string) => ParsedBorder;
/**
 * The same, or null when any part can't be held exactly: a width that
 * isn't px (`thin`, `0.1rem`), a style outside the four supported
 * (`double`), or more than one leftover token. The caller keeps the
 * value as written.
 */
export declare const parseBorderShorthandOrNull: (raw: string) => ParsedBorder | null;
