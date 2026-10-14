import type { ReactNode } from 'react';

import { PrefixSuffixInput } from './PrefixSuffixInput';
import { SpaceTokenButton } from './SpaceTokenButton';
import {
  formatSpaceValue,
  isTokenSpaceValue,
  spaceValueEquals,
  tokenSpaceValue,
  type SpaceValue,
} from '@lib/spaceValue';
import type { ThemeToken } from '@shared/types';

type Props = {
  value: SpaceValue;
  onChange: (next: SpaceValue) => void;
  /** Minimum allowed numeric value. Tokens bypass this clamp. */
  min?: number;
  /** Inline prefix — a short string (e.g. "C-gap") or an icon node. */
  prefix?: ReactNode;
  /** Plain-text name for the field, used for the token picker's aria
   *  label when `prefix` is an icon (a node) rather than a string. */
  label?: string;
  /** Tooltip on hover. */
  title?: string;
  /** Length-shaped theme tokens to offer in the picker. Omit to hide. */
  tokens?: ReadonlyArray<ThemeToken>;
  /** Opens the Theme tokens panel from the empty-state row. */
  onOpenTheme?: () => void;
  /** Several selected elements disagree: show **Mixed**, and commit whatever is typed. */
  mixed?: boolean;
};

const VAR_RE = /^var\(\s*--[A-Za-z_][\w-]*(?:\s*,[^)]*)?\)$/;

/**
 * Parse a single user-typed token. Accepts a bare number (with or
 * without `px`), a `var(--name)` reference, or empty (→ 0). Anything
 * else returns null and the caller reverts.
 */
const parseSingle = (raw: string, min: number): SpaceValue | null => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 0;
  if (VAR_RE.test(trimmed)) {
    return { kind: 'token', ref: trimmed };
  }
  const numeric = trimmed.replace(/px$/i, '');
  const n = Number(numeric);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.round(n));
};

/**
 * Single-value sibling of `FourSideInput`. Used for `gap`,
 * `column-gap`, `row-gap` — typed as `SpaceValue` (px number or
 * `var(--token)`). Renders an optional token-picker icon on the
 * right that, when clicked, lets the user apply a project spacing
 * token without dropping into raw CSS.
 *
 * Mirrors the visual + interaction model of `FourSideInput` so all
 * spacing-typed controls behave consistently.
 */
export const SpaceValueInput = ({
  value,
  onChange,
  min = 0,
  prefix,
  label,
  title,
  tokens,
  onOpenTheme,
  mixed = false,
}: Props): JSX.Element => {
  const stringValue = formatSpaceValue(value);

  const handleCommit = (draft: string): void => {
    const parsed = parseSingle(draft, min);
    if (parsed === null) return;
    if (mixed || !spaceValueEquals(parsed, value)) onChange(parsed);
  };

  const handleArrow = (
    draft: string,
    direction: 1 | -1,
    shift: boolean
  ): void => {
    // Token values aren't numeric; arrows are a no-op on them — the
    // user must clear via the picker or hand-type to switch back.
    if (typeof value !== 'number') return;
    const step = (shift ? 10 : 1) * direction;
    const parsed = Number(draft.trim().replace(/px$/i, ''));
    const current = Number.isFinite(parsed) ? parsed : value;
    const next = Math.max(min, current + step);
    if (next !== value) onChange(next);
  };

  const handleSelectToken = (varRef: string): void => {
    onChange(tokenSpaceValue(varRef));
  };

  // The token picker's aria label needs plain text — use `label`, or
  // `prefix` when it's a string, else a generic fallback.
  const tokenName = label ?? (typeof prefix === 'string' ? prefix : undefined);
  const suffix = tokens ? (
    <SpaceTokenButton
      tokens={tokens}
      onSelect={handleSelectToken}
      {...(onOpenTheme ? { onOpenTheme } : {})}
      active={isTokenSpaceValue(value)}
      ariaLabel={tokenName ? `Pick ${tokenName} token` : 'Pick spacing token'}
    />
  ) : undefined;

  return (
    <PrefixSuffixInput
      value={stringValue}
      onCommit={handleCommit}
      onArrow={handleArrow}
      prefix={prefix}
      {...(label !== undefined ? { dataPrefix: label } : {})}
      placeholder="0"
      mixed={mixed}
      {...(title !== undefined ? { title } : {})}
      {...(suffix !== undefined ? { suffix } : {})}
    />
  );
};
