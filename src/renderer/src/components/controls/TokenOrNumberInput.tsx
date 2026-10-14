import { type KeyboardEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconColorSwatch } from '@tabler/icons-react';
import type { ThemeToken } from '@shared/types';
import { usePopover } from '../../hooks/usePopover';
import { Tooltip } from './Tooltip';
import styles from './TokenOrNumberInput.module.css';

type Props = {
  /**
   * Current stored CSS value — e.g. `"16px"`, `"1rem"`, `"1.5"`, or
   * `"var(--text-lg)"`. Undefined for empty.
   */
  value: string | undefined;
  /** Tokens eligible for this field (pre-filtered by category). */
  tokens: ReadonlyArray<ThemeToken>;
  /**
   * Unit appended when the user types a bare number (Figma-style
   * fallback). Pass `''` when unitless is the preferred form
   * (line-height).
   */
  defaultUnit: 'px' | '';
  onChange: (value: string | undefined) => void;
  /** Called when the user clicks "Add token" from the empty popover. */
  onOpenTheme?: () => void;
  /** Inline prefix label (e.g. "Sz", "LH"). */
  prefix?: string;
  placeholder?: string;
  /** Tooltip on the whole row. */
  title?: string;
  /** Several selected elements disagree: show **Mixed**, and commit whatever is typed. */
  mixed?: boolean;
};

const VAR_RE = /^var\(\s*(--[\w-]+)\s*\)$/;
const UNIT_RE = /(px|rem|em|%|pt|vw|vh|vmin|vmax|ch|ex)$/i;
const UNITLESS_NUMBER_RE = /^-?\d*\.?\d+$/;
const POPOVER_WIDTH = 180;
const POPOVER_MAX_HEIGHT = 320;

const isVarRef = (value: string | undefined): boolean =>
  value !== undefined && VAR_RE.test(value.trim());

const tokenNameFromValue = (value: string): string => {
  const m = value.match(VAR_RE);
  return m ? (m[1] ?? '') : '';
};

/**
 * Commit-time formatter. Applies Figma-style px fallback when the user
 * typed a bare number and the field expects a unit. Returns `null`
 * when the input can't be interpreted (caller reverts).
 */
const formatCommit = (
  draft: string,
  defaultUnit: 'px' | ''
): string | null => {
  const trimmed = draft.trim();
  if (trimmed.length === 0) return '';
  // Token refs pass through.
  if (VAR_RE.test(trimmed)) return trimmed;
  // Bare number: maybe append the default unit.
  if (UNITLESS_NUMBER_RE.test(trimmed)) {
    if (defaultUnit === '') return trimmed;
    return `${trimmed}${defaultUnit}`;
  }
  // Number with unit → accept.
  if (UNIT_RE.test(trimmed) && /\d/.test(trimmed)) return trimmed;
  // Anything else we don't know how to format.
  return null;
};

export const TokenOrNumberInput = ({
  value,
  tokens,
  defaultUnit,
  onChange,
  onOpenTheme,
  prefix,
  placeholder,
  title,
  mixed = false,
}: Props): JSX.Element => {
  const shown = mixed ? '' : value ?? '';
  const [draft, setDraft] = useState<string>(shown);

  const popover = usePopover<HTMLButtonElement>({
    position: {
      width: POPOVER_WIDTH,
      desiredMaxHeight: POPOVER_MAX_HEIGHT,
      align: 'right',
    },
  });

  useEffect(() => {
    setDraft(shown);
  }, [shown]);

  const commit = (): void => {
    if (mixed && draft.trim().length === 0) return;
    const formatted = formatCommit(draft, defaultUnit);
    if (formatted === null) {
      // Revert on invalid.
      setDraft(value ?? '');
      return;
    }
    if (formatted === '') {
      if (value !== undefined) onChange(undefined);
      return;
    }
    if (formatted !== value || mixed) onChange(formatted);
    setDraft(formatted);
  };

  // Arrow-key stepping: only meaningful for numeric values. Parse the
  // draft, step by 1 (or 10 with shift), preserve the unit suffix.
  const step = (delta: number): void => {
    if (mixed) return;
    const match = draft.trim().match(/^(-?\d*\.?\d+)(\D*)$/);
    if (!match) return;
    const n = Number(match[1]);
    if (!Number.isFinite(n)) return;
    const unit = match[2] ?? '';
    const next = `${n + delta}${unit}`;
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
      step(e.shiftKey ? 10 : 1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      step(e.shiftKey ? -10 : -1);
      return;
    }
  };

  const showingToken = !mixed && isVarRef(value);
  const tokenName = showingToken && value ? tokenNameFromValue(value) : '';

  const clearToken = (): void => {
    onChange(undefined);
  };

  const selectToken = (token: ThemeToken): void => {
    onChange(`var(${token.name})`);
    popover.setOpen(false);
  };

  const rowEl = (
    <div className={styles.row} data-prefix={prefix}>
      {prefix && <span className={styles.prefix}>{prefix}</span>}
      {showingToken ? (
        <div className={styles.pill}>
          <span className={styles.pillLabel}>{tokenName}</span>
          <button
            type="button"
            className={styles.pillClear}
            onClick={clearToken}
            aria-label="Clear token"
          >
            ×
          </button>
        </div>
      ) : (
        <input
          type="text"
          inputMode="decimal"
          className={styles.input}
          value={draft}
          placeholder={mixed ? 'Mixed' : placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
      )}
      <button
        ref={popover.triggerRef}
        type="button"
        className={`${styles.tokenButton} ${
          showingToken ? styles.tokenButtonActive : ''
        }`}
        onClick={popover.toggle}
        aria-label="Pick token"
      >
        <IconColorSwatch size={14} stroke={1.75} />
      </button>
    </div>
  );

  // Render the popover into `document.body` via a portal so it can't
  // be affected by any `transform`, `filter`, or `overflow` on parent
  // components — it positions purely against the viewport.
  const popoverEl = popover.open && popover.position ? (
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
      {tokens.length === 0 ? (
        <div className={styles.empty}>
          <div>No matching tokens yet.</div>
          {onOpenTheme && (
            <button
              type="button"
              className={styles.addTokenButton}
              onClick={() => {
                popover.setOpen(false);
                onOpenTheme();
              }}
            >
              + Add token
            </button>
          )}
        </div>
      ) : (
        <div className={styles.tokenList}>
          {tokens.map((token) => (
            <button
              key={token.name}
              type="button"
              role="option"
              className={styles.tokenRow}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectToken(token)}
            >
              <span className={styles.tokenRowIcon} aria-hidden="true">
                <IconColorSwatch size={14} stroke={1.75} />
              </span>
              <span className={styles.tokenRowName}>{token.name}</span>
              <span className={styles.tokenRowValue}>{token.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      {title ? <Tooltip label={title}>{rowEl}</Tooltip> : rowEl}
      {popoverEl && createPortal(popoverEl, document.body)}
    </>
  );
};
