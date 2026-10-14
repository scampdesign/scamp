import type { ReactNode } from 'react';
import { Tooltip } from './Tooltip';
import styles from './Controls.module.css';

/** Optional per-option tooltip. When set, the button is wrapped in
 *  Tooltip so each segment can describe its effect individually. */
type OptionBase<V extends string> = {
  value: V;
  tooltip?: string;
};

/**
 * Discriminated by `label`: a plain-string label is its own accessible
 * name, so `ariaLabel` stays optional. A non-text ReactNode label
 * (icon-only segment) carries no accessible name, so `ariaLabel` is
 * REQUIRED — the type, not just a doc comment, now enforces it. (A
 * string is assignable to `ReactNode`, so a string label matches the
 * first arm and never trips the requirement.)
 */
type Option<V extends string> =
  | (OptionBase<V> & { label: string; ariaLabel?: string })
  | (OptionBase<V> & { label: ReactNode; ariaLabel: string });

type Props<V extends string> = {
  value: V;
  options: ReadonlyArray<Option<V>>;
  onChange: (value: V) => void;
  /** Tooltip shown on hover of the whole group. Mutually useful with
   * per-option tooltips — the group-level tooltip describes the axis,
   * per-option tooltips describe each segment. */
  title?: string;
  /** Several selected elements disagree: show **Mixed**, and commit whatever is typed. */
  mixed?: boolean;
};

export const SegmentedControl = <V extends string>({
  value,
  options,
  onChange,
  title,
  mixed = false,
}: Props<V>): JSX.Element => {
  const group = (
    <div className={styles.segmented} role="radiogroup">
      {options.map((opt) => {
        const active = !mixed && opt.value === value;
        const accessibleName =
          opt.ariaLabel ??
          opt.tooltip ??
          (typeof opt.label === 'string' ? opt.label : undefined);
        const button = (
          <button
            type="button"
            key={opt.value}
            role="radio"
            aria-checked={active}
            aria-label={accessibleName}
            className={`${styles.segmentedButton} ${active ? styles.segmentedButtonActive : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
        return opt.tooltip ? (
          <Tooltip key={opt.value} label={opt.tooltip}>
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </div>
  );
  return title ? <Tooltip label={title}>{group}</Tooltip> : group;
};
