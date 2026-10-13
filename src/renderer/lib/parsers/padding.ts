// parsers/padding.ts — split out of parsers.ts (4.3).
import { type SpaceTuple, type SpaceValue } from "../spaceValue";
import { parseMarginValueOrNull, parsePx, parseSpaceValueOrNull } from "./common";
import { tokenizeBorder } from "./internal";

/**
 * Parse a CSS `padding` shorthand into [top, right, bottom, left] in px.
 *
 * Supports the standard 1-, 2-, 3-, and 4-value forms.
 */
export const parsePaddingShorthand = (
  raw: string
): [number, number, number, number] => {
  if (typeof raw !== 'string') return [0, 0, 0, 0];
  const tokens = raw.trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return [0, 0, 0, 0];

  const v = tokens.map(parsePx);

  if (v.length === 1) {
    const [a] = v as [number];
    return [a, a, a, a];
  }
  if (v.length === 2) {
    const [a, b] = v as [number, number];
    return [a, b, a, b];
  }
  if (v.length === 3) {
    const [a, b, c] = v as [number, number, number];
    return [a, b, c, b];
  }
  const [a, b, c, d] = v as [number, number, number, number];
  return [a, b, c, d];
};


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
export const parsePaddingShorthandOrNull = (
  raw: string,
  /** Margins take `auto` on a side (`0 auto` centers); padding can't. */
  allowAuto = false
): SpaceTuple | null => {
  if (typeof raw !== 'string') return null;
  const tokens = tokenizeBorder(raw.trim());
  if (tokens.length === 0) return null;
  const v: SpaceValue[] = [];
  for (const tok of tokens) {
    const s = allowAuto ? parseMarginValueOrNull(tok) : parseSpaceValueOrNull(tok);
    if (s === null) return null;
    v.push(s);
  }
  if (v.length === 1) {
    const [a] = v as [SpaceValue];
    return [a, a, a, a];
  }
  if (v.length === 2) {
    const [a, b] = v as [SpaceValue, SpaceValue];
    return [a, b, a, b];
  }
  if (v.length === 3) {
    const [a, b, c] = v as [SpaceValue, SpaceValue, SpaceValue];
    return [a, b, c, b];
  }
  if (v.length === 4) {
    const [a, b, c, d] = v as [SpaceValue, SpaceValue, SpaceValue, SpaceValue];
    return [a, b, c, d];
  }
  return null;
};

