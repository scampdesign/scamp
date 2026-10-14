import type { ReactNode } from 'react';
import { PrefixSuffixInput } from './PrefixSuffixInput';

type Props = {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  /** Minimum allowed value (inclusive). Values below revert on blur. */
  min?: number;
  /** Maximum allowed value (inclusive). Values above revert on blur. */
  max?: number;
  /** Placeholder shown when value is undefined. */
  placeholder?: string;
  /** When true, blanking the input writes `undefined` instead of reverting. */
  allowEmpty?: boolean;
  /** Inline prefix label shown inside the input (e.g. "W", "H", "X"). */
  prefix?: string;
  /** Inline suffix — typically a unit indicator icon (e.g. `%`). */
  suffix?: ReactNode;
  /** Tooltip shown on hover. */
  title?: string;
  /** When true, the input is rendered greyed-out and rejects edits. */
  disabled?: boolean;
  /**
   * When true, the displayed value is a layout-derived read-out (e.g.
   * an element's `offsetWidth` while in `fit-content` mode). Renders
   * the value italic + dimmed so it reads as "this is computed, not
   * stored." Editing still works — typing commits a new value via
   * `onChange`, which the parent typically uses to switch the field
   * to a fixed mode.
   */
  computed?: boolean;
  /** Several selected elements disagree: show **Mixed**, and commit whatever is typed. */
  mixed?: boolean;
};

const clamp = (n: number, min?: number, max?: number): number => {
  let out = n;
  if (typeof min === 'number' && out < min) out = min;
  if (typeof max === 'number' && out > max) out = max;
  return out;
};

/**
 * Numeric input. Thin wrapper over PrefixSuffixInput that handles
 * parsing, clamping, and arrow-key stepping.
 */
export const NumberInput = ({
  value,
  onChange,
  min,
  max,
  placeholder,
  allowEmpty = false,
  prefix,
  suffix,
  title,
  disabled = false,
  computed = false,
  mixed = false,
}: Props): JSX.Element => {
  const stringValue = value === undefined ? '' : String(value);

  const handleCommit = (draft: string): void => {
    if (draft.length === 0) {
      if (allowEmpty && value !== undefined) onChange(undefined);
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) return;
    const next = clamp(parsed, min, max);
    if (next !== value || mixed) onChange(next);
  };

  const handleArrow = (draft: string, direction: 1 | -1, shift: boolean): void => {
    const step = (shift ? 10 : 1) * direction;
    const fallback =
      value !== undefined ? value : typeof min === 'number' ? min : 0;
    const parsed = Number(draft.trim());
    const current = Number.isFinite(parsed) ? parsed : fallback;
    const next = clamp(current + step, min, max);
    if (next !== value) onChange(next);
  };

  return (
    <PrefixSuffixInput
      value={stringValue}
      onCommit={handleCommit}
      onArrow={handleArrow}
      prefix={prefix}
      suffix={suffix}
      placeholder={placeholder}
      inputMode="numeric"
      title={title}
      disabled={disabled}
      computed={computed}
      mixed={mixed}
    />
  );
};
