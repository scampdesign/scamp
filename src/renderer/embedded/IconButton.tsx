import type { Icon } from '@tabler/icons-react';

import styles from './IconButton.module.css';

type Props = {
  icon: Icon;
  /** The accessible name, also shown as the tooltip. */
  label: string;
  onClick: () => void;
  /** Set for a toggle; leave out for a plain action. */
  pressed?: boolean;
  disabled?: boolean;
  testId?: string;
  /** `bare`: the design's artboard-header icon, 22px with no box. */
  variant?: 'box' | 'bare';
};

/** A 32px icon button, as the scamp-ui Layout design draws them. */
export const IconButton = ({ icon: Glyph, label, onClick, pressed, disabled, testId, variant = 'box' }: Props): JSX.Element => (
  <button
    type="button"
    className={styles.button}
    data-variant={variant}
    aria-label={label}
    title={label}
    aria-pressed={pressed}
    disabled={disabled}
    onClick={onClick}
    data-testid={testId}
  >
    <Glyph className={styles.glyph} aria-hidden="true" />
  </button>
);
