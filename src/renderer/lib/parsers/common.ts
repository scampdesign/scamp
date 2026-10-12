// parsers/common.ts — split out of parsers.ts (4.3).
import { tokenSpaceValue, type SpaceValue } from "../spaceValue";


/**
 * Split a CSS value-list on top-level commas, respecting parens. Used
 * to break a `transition` shorthand like
 *   `opacity 200ms ease, transform 300ms cubic-bezier(0.4, 0, 0.2, 1)`
 * into per-transition segments without splitting inside cubic-bezier.
 */
export const splitCssList = (raw: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      out.push(raw.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = raw.slice(start).trim();
  if (tail.length > 0) out.push(tail);
  return out;
};


/**
 * Split a single CSS shorthand segment into space-separated tokens
 * with parens kept intact. A `cubic-bezier(0.4, 0, 0.2, 1)` or an
 * `rgba(0, 0, 0, 0.15)` is one token even though it contains spaces
 * and commas. Used by the transition and box-shadow parsers.
 */
export const tokenizeShorthandSegment = (raw: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && /\s/.test(ch as string)) {
      const tok = raw.slice(start, i).trim();
      if (tok.length > 0) out.push(tok);
      start = i + 1;
    }
  }
  const tail = raw.slice(start).trim();
  if (tail.length > 0) out.push(tail);
  return out;
};


// ---- Refusable variants ---------------------------------------------
//
// The classic `parsePx` / `parsePaddingShorthand` / `parseBorderRadiusShorthand`
// helpers return 0 / [0,0,0,0] for any input they can't interpret, which
// is convenient for typed canvas state but lossy when an agent has
// written something Scamp doesn't model — `padding: 50%`,
// `border-radius: 1.5em`, `padding: 16px auto`, etc.
//
// These refusable variants return `null` instead so the cssPropertyMap
// can detect "Scamp can't reduce this to typed fields" and fall through
// to `customProperties` with the raw declaration intact. The original
// helpers stay put for callers that need a non-null number.
//
// `var(--token)` references ARE accepted — they round-trip through
// the typed shape as `{ kind: 'token', ref: 'var(--name)' }` rather
// than falling to customProperties. See `spaceValue.ts`.

/**
 * Parse a `123px` (or bare number) into an integer, or `null` for non-px
 * tokens (so callers can preserve `%`, `rem`, `em`, `auto`, etc. by
 * falling through to customProperties). Plain numbers (no unit), bare
 * zero, and `Npx` all parse to a number.
 */
export const parsePxOrNull = (raw: string): number | null => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)(?:px)?$/);
  if (!match || match[1] === undefined) return null;
  return Math.round(Number(match[1]));
};

/**
 * Parse a `123px` (or bare number) into an integer. Returns 0 for empty
 * or unparseable input — keeps callers from having to special-case missing
 * values themselves.
 */
export const parsePx = (raw: string): number => parsePxOrNull(raw) ?? 0;


/**
 * Match a `var(--name)` or `var(--name, fallback)` reference. Returns
 * the full source string (including the `var(` wrapper and any
 * fallback) so the generator can round-trip it byte-for-byte. Anything
 * else returns `null`.
 *
 * We accept fallbacks because they're valid CSS and agents do write
 * them occasionally. The fallback is preserved verbatim — Scamp
 * doesn't try to resolve or split it.
 */
const VAR_TOKEN_RE = /^var\(\s*--[A-Za-z_][\w-]*(?:\s*,[^)]*)?\)$/;


export const parseVarTokenOrNull = (raw: string): string | null => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (!VAR_TOKEN_RE.test(trimmed)) return null;
  return trimmed;
};


/**
 * Parse a single spacing token — either px (returns `number`) or
 * `var(--name)` (returns the token discriminated form). Anything
 * else returns `null` so the caller can refuse the whole shorthand.
 */
export const parseSpaceValueOrNull = (raw: string): SpaceValue | null => {
  const px = parsePxOrNull(raw);
  if (px !== null) return px;
  const ref = parseVarTokenOrNull(raw);
  if (ref !== null) return tokenSpaceValue(ref);
  return null;
};

