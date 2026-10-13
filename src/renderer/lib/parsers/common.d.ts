import { type SpaceValue } from "../spaceValue";
/**
 * Split a CSS value-list on top-level commas, respecting parens. Used
 * to break a `transition` shorthand like
 *   `opacity 200ms ease, transform 300ms cubic-bezier(0.4, 0, 0.2, 1)`
 * into per-transition segments without splitting inside cubic-bezier.
 */
export declare const splitCssList: (raw: string) => string[];
/**
 * Split a single CSS shorthand segment into space-separated tokens
 * with parens kept intact. A `cubic-bezier(0.4, 0, 0.2, 1)` or an
 * `rgba(0, 0, 0, 0.15)` is one token even though it contains spaces
 * and commas. Used by the transition and box-shadow parsers.
 */
export declare const tokenizeShorthandSegment: (raw: string) => string[];
/**
 * Parse a `123px` (or bare number) into an integer, or `null` for non-px
 * tokens (so callers can preserve `%`, `rem`, `em`, `auto`, etc. by
 * falling through to customProperties). Plain numbers (no unit), bare
 * zero, and `Npx` all parse to a number.
 */
export declare const parsePxOrNull: (raw: string) => number | null;
/**
 * Parse a `123px` (or bare number) into an integer. Returns 0 for empty
 * or unparseable input — keeps callers from having to special-case missing
 * values themselves.
 */
export declare const parsePx: (raw: string) => number;
export declare const parseVarTokenOrNull: (raw: string) => string | null;
/**
 * Parse a single spacing token — either px (returns `number`) or
 * `var(--name)` (returns the token discriminated form). Anything
 * else returns `null` so the caller can refuse the whole shorthand.
 */
export declare const parseSpaceValueOrNull: (raw: string) => SpaceValue | null;
/** A margin side: anything a space value is, or `auto`. */
export declare const parseMarginValueOrNull: (raw: string) => SpaceValue | null;
