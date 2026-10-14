import { type KeyboardEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { usePopover } from '../../hooks/usePopover';
import { Tooltip } from './Tooltip';
import styles from './WeightSelect.module.css';

type Props = {
  /** Current weight as a string, e.g. "400". */
  value: string;
  onChange: (value: string) => void;
  /** Tooltip on the whole control. */
  title?: string;
  /** Several selected elements disagree: show **Mixed**, and commit whatever is typed. */
  mixed?: boolean;
};

/** The nine standard named weights, in ramp order. */
const WEIGHTS: ReadonlyArray<{ value: string; name: string }> = [
  { value: '100', name: 'Thin' },
  { value: '200', name: 'Extra Light' },
  { value: '300', name: 'Light' },
  { value: '400', name: 'Regular' },
  { value: '500', name: 'Medium' },
  { value: '600', name: 'Semibold' },
  { value: '700', name: 'Bold' },
  { value: '800', name: 'Extra Bold' },
  { value: '900', name: 'Black' },
];

const POPOVER_WIDTH = 168;
const POPOVER_MAX_HEIGHT = 300;

const nameForWeight = (value: string): string =>
  WEIGHTS.find((w) => w.value === value.trim())?.name ?? '';

const parseWeight = (raw: string): number | null => {
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : null;
};

/**
 * Editable weight combobox: pick a named weight (100 Thin … 900 Black) from
 * the dropdown, or type any value (e.g. 350 for a variable font). Emits the
 * committed weight as a string; the caller decides how to store it.
 */
export const WeightSelect = ({
  value,
  onChange,
  title,
  mixed = false,
}: Props): JSX.Element => {
  const [draft, setDraft] = useState<string>(mixed ? '' : value);

  const popover = usePopover<HTMLButtonElement>({
    position: {
      width: POPOVER_WIDTH,
      desiredMaxHeight: POPOVER_MAX_HEIGHT,
      align: 'right',
    },
  });

  const shown = mixed ? '' : value;
  useEffect(() => {
    setDraft(shown);
  }, [shown]);

  const commit = (): void => {
    const n = parseWeight(draft);
    if (n === null) {
      setDraft(shown); // revert on invalid, and an empty Mixed field
      return;
    }
    const next = String(n);
    if (next !== value || mixed) onChange(next);
    setDraft(next);
  };

  const step = (delta: number): void => {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n)) return;
    const next = String(Math.min(1000, Math.max(1, n + delta)));
    setDraft(next);
    onChange(next);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      step(e.shiftKey ? 10 : 100);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      step(e.shiftKey ? -10 : -100);
      return;
    }
  };

  const selectWeight = (v: string): void => {
    setDraft(v);
    if (v !== value || mixed) onChange(v);
    popover.setOpen(false);
  };

  const rowEl = (
    <div className={styles.row}>
      <input
        type="text"
        inputMode="numeric"
        className={styles.input}
        value={draft}
        placeholder={mixed ? 'Mixed' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        aria-label="Font weight"
      />
      <span className={styles.name}>{nameForWeight(draft)}</span>
      <button
        ref={popover.triggerRef}
        type="button"
        className={styles.caret}
        onClick={popover.toggle}
        aria-label="Pick font weight"
      >
        ▾
      </button>
    </div>
  );

  const popoverEl =
    popover.open && popover.position ? (
      <div
        ref={popover.popoverRef}
        className={styles.popover}
        style={{
          left: popover.position.left,
          top: popover.position.top,
          bottom: popover.position.bottom,
          width: popover.position.width,
          maxHeight: popover.position.maxHeight,
        }}
        role="listbox"
      >
        {WEIGHTS.map((w) => {
          const active = w.value === value.trim();
          return (
            <button
              key={w.value}
              type="button"
              role="option"
              aria-selected={active}
              className={`${styles.option} ${active ? styles.optionActive : ''}`}
              style={{ fontWeight: Number(w.value) }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectWeight(w.value)}
            >
              <span className={styles.optionValue}>{w.value}</span>
              <span className={styles.optionName}>{w.name}</span>
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <>
      {title ? <Tooltip label={title}>{rowEl}</Tooltip> : rowEl}
      {popoverEl && createPortal(popoverEl, document.body)}
    </>
  );
};
