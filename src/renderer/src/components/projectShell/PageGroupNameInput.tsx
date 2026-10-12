import { useRef, useState } from 'react';

import styles from '../ProjectShell.module.css';

type Props = {
  initialValue: string;
  /** Why a proposed name can't be used, or null. */
  nameError: (name: string) => string | null;
  onConfirm: (name: string) => void;
  onCancel: () => void;
};

/** Inline name field for a page group. Enter or blur saves; Escape cancels. */
export const PageGroupNameInput = ({ initialValue, nameError, onConfirm, onCancel }: Props): JSX.Element => {
  const [draft, setDraft] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  // Escape unmounts the input, and the blur that follows mustn't save.
  const settled = useRef(false);

  const handleConfirm = (): void => {
    if (settled.current) return;
    const problem = nameError(draft);
    if (problem !== null) {
      setError(problem);
      return;
    }
    settled.current = true;
    onConfirm(draft.trim());
  };

  return (
    <div className={styles.groupRename}>
      <input
        className={styles.groupNameInput}
        aria-label="Group name"
        value={draft}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleConfirm();
          if (e.key === 'Escape') {
            settled.current = true;
            onCancel();
          }
        }}
        onBlur={handleConfirm}
      />
      {error !== null && <span className={styles.groupNameError}>{error}</span>}
    </div>
  );
};
