import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { validatePageName } from '@shared/pageName';
import styles from './PageNameInput.module.css';

type Props = {
  initialValue?: string;
  /** Other page names in the project — drives collision feedback. */
  existingNames: ReadonlyArray<string>;
  onConfirm: (name: string) => void;
  onCancel: () => void;
  /** If present, range selected on mount so the user can retype quickly. */
  selectRange?: [number, number];
  /** External error message (e.g. IPC failure) shown under the input. */
  error?: string | null;
  /** When true, input is read-only and shows a loading indicator. */
  busy?: boolean;
};

/**
 * Inline text input for naming or renaming a page. Used by the
 * "Add page" flow and the "Duplicate" flow. Autofocuses on mount;
 * validates on every keystroke and surfaces the first error under the
 * field. Enter confirms (when valid), Escape cancels, blur cancels.
 */
export const PageNameInput = ({
  initialValue = '',
  existingNames,
  onConfirm,
  onCancel,
  selectRange,
  error: externalError,
  busy = false,
}: Props): JSX.Element => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initialValue);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (selectRange) {
      const [start, end] = selectRange;
      el.setSelectionRange(start, end);
    } else {
      el.select();
    }
  }, [selectRange]);

  const validation = validatePageName(draft, existingNames);
  // Don't show validation errors until the user has typed at least once —
  // a seeded value that happens to collide shouldn't flash red immediately.
  const visibleError =
    externalError ??
    (touched && !validation.ok ? validation.error : null);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (validation.ok && !busy) onConfirm(validation.value);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }
    // Stop propagation so shortcuts (V, R, T, I) don't fire while typing.
    e.stopPropagation();
  };

  return (
    <div className={styles.wrap}>
      <input
        ref={inputRef}
        type="text"
        className={`${styles.input} ${visibleError ? styles.inputError : ''}`}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (!touched) setTouched(true);
        }}
        onBlur={() => {
          // Blur cancels rather than confirming. This matches the element
          // rename input and prevents accidental creations when the user
          // clicks away mid-typing.
          if (!busy) onCancel();
        }}
        onKeyDown={handleKeyDown}
        disabled={busy}
        placeholder="page-name"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
      {visibleError && <div className={styles.error}>{visibleError}</div>}
      {busy && <div className={styles.busy}>Working…</div>}
    </div>
  );
};
