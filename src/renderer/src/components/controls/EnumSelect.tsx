import { Tooltip } from './Tooltip';
import styles from './Controls.module.css';

type Option<V extends string> = {
  value: V;
  label: string;
  /**
   * When true the option renders greyed and unselectable. The currently
   * selected value still displays even if disabled (native `<select>`
   * shows the matching option regardless), so callers can disable a mode
   * without breaking an element that already uses it.
   */
  disabled?: boolean;
};

type Props<V extends string> = {
  value: V;
  options: ReadonlyArray<Option<V>>;
  onChange: (value: V) => void;
  /** Tooltip shown on hover. */
  title?: string;
  /** Several selected elements disagree: show **Mixed**, and commit whatever is typed. */
  mixed?: boolean;
};

export const EnumSelect = <V extends string>({
  value,
  options,
  onChange,
  title,
  mixed = false,
}: Props<V>): JSX.Element => {
  const select = (
    <select
      className={styles.select}
      value={mixed ? '' : value}
      onChange={(e) => onChange(e.target.value as V)}
    >
      {mixed && (
        <option value="" disabled hidden>
          Mixed
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} disabled={opt.disabled}>
          {opt.label}
        </option>
      ))}
    </select>
  );
  return title ? <Tooltip label={title}>{select}</Tooltip> : select;
};
