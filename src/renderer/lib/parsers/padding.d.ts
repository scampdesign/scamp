import { type SpaceTuple } from "../spaceValue";
/**
 * Parse a CSS `padding` shorthand into [top, right, bottom, left] in px.
 *
 * Supports the standard 1-, 2-, 3-, and 4-value forms.
 */
export declare const parsePaddingShorthand: (raw: string) => [number, number, number, number];
/**
 * Refusable variant of `parsePaddingShorthand` that returns a
 * `SpaceTuple` (each side is px or `var()`). Returns `null` if any
 * token isn't accepted by `parseSpaceValueOrNull` — keeping declarations
 * with `%`, `rem`, `auto`, etc. flowing into customProperties.
 *
 * Tokens are split on whitespace OUTSIDE parens so values like
 * `var(--a, 16px) var(--b)` parse correctly without splitting the
 * fallback's internal comma-space.
 */
export declare const parsePaddingShorthandOrNull: (raw: string, 
/** Margins take `auto` on a side (`0 auto` centers); padding can't. */
allowAuto?: boolean) => SpaceTuple | null;
