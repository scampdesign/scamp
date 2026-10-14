import type { ReactNode } from 'react';

import { PrefixSuffixInput } from './PrefixSuffixInput';
import { SpaceTokenButton } from './SpaceTokenButton';
import {
  formatSpaceShorthand,
  formatSpaceValue,
  AUTO_SPACE_VALUE,
  isTokenSpaceValue,
  spaceTupleEquals,
  spaceValueEquals,
  tokenSpaceValue,
  type SpaceTuple,
  type SpaceValue,
} from '@lib/spaceValue';
import type { ThemeToken } from '@shared/types';

type Props = {
  value: SpaceTuple;
  onChange: (next: SpaceTuple) => void;
  /** Minimum allowed per-side numeric value (inclusive). Tokens
   *  bypass this — they're emitted verbatim. */
  min?: number;
  /** Inline prefix — a short string (e.g. "M") or an icon node. */
  prefix?: ReactNode;
  /** Plain-text name for the field, used for the token picker's aria
   *  label when `prefix` is an icon (a node) rather than a string. */
  label?: string;
  /** Tooltip shown on hover. */
  title?: string;
  /** Length-shaped theme tokens to offer in the picker. Omit to hide
   *  the picker icon entirely. */
  tokens?: ReadonlyArray<ThemeToken>;
  /** Opens the Theme tokens panel from the empty-state row. */
  onOpenTheme?: () => void;
  /** Accept `auto` on a side — margins only. */
  allowAuto?: boolean;
  /** Several selected elements disagree: show **Mixed**, and commit whatever is typed. */
  mixed?: boolean;
};

/**
 * Tokenise a shorthand string, respecting parens so values like
 * `var(--a, 16px) 8` split into two tokens rather than four.
 */
const tokenize = (raw: string): string[] => {
  const tokens: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of raw) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (/[\s,]/.test(ch) && depth === 0) {
      if (current.length > 0) tokens.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
};

const VAR_RE = /^var\(\s*--[A-Za-z_][\w-]*(?:\s*,[^)]*)?\)$/;

const parseToken = (raw: string, min: number, allowAuto: boolean): SpaceValue | null => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (allowAuto && trimmed.toLowerCase() === 'auto') return AUTO_SPACE_VALUE;
  if (VAR_RE.test(trimmed)) {
    return { kind: 'token', ref: trimmed };
  }
  // Strip a trailing "px" if present, otherwise treat as a bare number.
  const numeric = trimmed.replace(/px$/i, '');
  const n = Number(numeric);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.round(n));
};

/**
 * Parse a CSS-style shorthand into a `SpaceTuple`. Accepts 1, 2, 3,
 * or 4 tokens. Each token may be a plain number (clamped to `min`),
 * an `Npx` value, or a `var(--name)` reference. Mixed forms are
 * allowed (`16 var(--space-md)`). Returns `null` for any unparseable
 * input so callers can revert on blur.
 */
const parseShorthand = (
  raw: string,
  min: number,
  allowAuto = false
): SpaceTuple | null => {
  const tokens = tokenize(raw.trim());
  if (tokens.length === 0 || tokens.length > 4) return null;

  const values: SpaceValue[] = [];
  for (const t of tokens) {
    const v = parseToken(t, min, allowAuto);
    if (v === null) return null;
    values.push(v);
  }

  if (values.length === 1) {
    const [a] = values as [SpaceValue];
    return [a, a, a, a];
  }
  if (values.length === 2) {
    const [a, b] = values as [SpaceValue, SpaceValue];
    return [a, b, a, b];
  }
  if (values.length === 3) {
    const [a, b, c] = values as [SpaceValue, SpaceValue, SpaceValue];
    return [a, b, c, b];
  }
  const [a, b, c, d] = values as [SpaceValue, SpaceValue, SpaceValue, SpaceValue];
  return [a, b, c, d];
};

/** Increment a single side. Tokens stay tokens — arrows are a numeric
 *  affordance, not a token-replace gesture. */
const bumpSide = (v: SpaceValue, delta: number, min: number): SpaceValue => {
  if (typeof v !== 'number') return v;
  return Math.max(min, v + delta);
};

/**
 * A single text input for editing a [top, right, bottom, left] tuple using
 * CSS shorthand notation. Accepts 1–4 values separated by spaces or
 * commas. Each value can be a plain number, `Npx`, or a `var(--name)`
 * reference. Numbers and tokens can be mixed across sides.
 *
 * Invalid input reverts on blur via the PrefixSuffixInput value sync.
 */
export const FourSideInput = ({
  value,
  onChange,
  min = 0,
  prefix,
  label,
  title,
  tokens,
  onOpenTheme,
  allowAuto = false,
  mixed = false,
}: Props): JSX.Element => {
  const handleCommit = (draft: string): void => {
    const parsed = parseShorthand(draft, min, allowAuto);
    if (!parsed) return;
    if (mixed || !spaceTupleEquals(parsed, value)) onChange(parsed);
  };

  const handleArrow = (draft: string, direction: 1 | -1, shift: boolean): void => {
    const delta = (shift ? 10 : 1) * direction;
    const base = parseShorthand(draft, min, allowAuto) ?? value;
    const next: SpaceTuple = [
      bumpSide(base[0], delta, min),
      bumpSide(base[1], delta, min),
      bumpSide(base[2], delta, min),
      bumpSide(base[3], delta, min),
    ];
    if (!spaceTupleEquals(next, value)) onChange(next);
  };

  const allEqual =
    spaceValueEquals(value[0], value[1]) &&
    spaceValueEquals(value[1], value[2]) &&
    spaceValueEquals(value[2], value[3]);
  const tooltip =
    title ??
    (!allEqual
      ? `T:${formatSpaceValue(value[0])} R:${formatSpaceValue(value[1])} B:${formatSpaceValue(value[2])} L:${formatSpaceValue(value[3])}`
      : undefined);

  // Picking a token applies it uniformly to all four sides. The
  // per-side text input still accepts mixed forms (`16 var(--m)`)
  // for users who want asymmetric layouts; the picker is the
  // quick path for the common "same value everywhere" case.
  const handleSelectToken = (varRef: string): void => {
    const t = tokenSpaceValue(varRef);
    onChange([t, t, t, t]);
  };

  // Highlight the picker icon when any side currently holds a token —
  // a visible cue that the field's value isn't pure numeric.
  const anyTokenSide =
    isTokenSpaceValue(value[0]) ||
    isTokenSpaceValue(value[1]) ||
    isTokenSpaceValue(value[2]) ||
    isTokenSpaceValue(value[3]);

  // The token picker's aria label needs plain text — use `label`, or
  // `prefix` when it's a string, else a generic fallback.
  const tokenName = label ?? (typeof prefix === 'string' ? prefix : undefined);
  const suffix = tokens ? (
    <SpaceTokenButton
      tokens={tokens}
      onSelect={handleSelectToken}
      {...(onOpenTheme ? { onOpenTheme } : {})}
      active={anyTokenSide}
      ariaLabel={tokenName ? `Pick ${tokenName} token` : 'Pick spacing token'}
    />
  ) : undefined;

  return (
    <PrefixSuffixInput
      value={formatSpaceShorthand(value)}
      onCommit={handleCommit}
      onArrow={handleArrow}
      prefix={prefix}
      {...(label !== undefined ? { dataPrefix: label } : {})}
      placeholder="0"
      mixed={mixed}
      title={tooltip}
      {...(suffix !== undefined ? { suffix } : {})}
    />
  );
};
