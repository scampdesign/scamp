import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

import { usePopover } from '../../hooks/usePopover';
import { Tooltip } from './Tooltip';
import styles from './TokenOrNumberInput.module.css';

export type PresetOption = {
  value: string;
  label: string;
  /** Optional secondary text (e.g. the resolved value) shown dimmed. */
  hint?: string;
};

type Props = {
  /** Trigger icon (a tabler icon element). */
  icon: ReactNode;
  /** Accessible label / tooltip for the trigger. */
  ariaLabel: string;
  options: ReadonlyArray<PresetOption>;
  onSelect: (value: string) => void;
  /** Paints the trigger in the accent colour (e.g. a preset is applied). */
  active?: boolean;
  testId?: string;
};

const POPOVER_WIDTH = 200;
const POPOVER_MAX_HEIGHT = 320;

/**
 * A compact icon button that opens a popover menu of presets — used for
 * the Typography "Text style" and Shadow "Preset" pickers so both apply a
 * multi-value preset from a single, consistent icon control. Shares the
 * token-picker button + popover styling. Renders nothing when there are
 * no options. see docs/archive/2026-07-23-design-system-plan.md
 */
export const PresetMenu = ({
  icon,
  ariaLabel,
  options,
  onSelect,
  active = false,
  testId,
}: Props): JSX.Element | null => {
  const popover = usePopover<HTMLButtonElement>({
    position: {
      width: POPOVER_WIDTH,
      desiredMaxHeight: POPOVER_MAX_HEIGHT,
      align: 'right',
    },
  });

  if (options.length === 0) return null;

  const handleSelect = (value: string): void => {
    onSelect(value);
    popover.setOpen(false);
  };

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
        <div className={styles.tokenList}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              className={styles.tokenRow}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(opt.value)}
            >
              <span className={styles.tokenRowName}>{opt.label}</span>
              {opt.hint !== undefined && (
                <span className={styles.tokenRowValue}>{opt.hint}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <>
      <Tooltip label={ariaLabel}>
        <button
          ref={popover.triggerRef}
          type="button"
          className={`${styles.tokenButton} ${active ? styles.tokenButtonActive : ''}`}
          onClick={(e) => {
            // Stop propagation so the trigger works when nested inside a
            // collapsible section's header <button> (Shadows) without
            // also toggling the section.
            e.stopPropagation();
            popover.toggle();
          }}
          onMouseDown={(e) => e.preventDefault()}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          data-testid={testId}
        >
          {icon}
        </button>
      </Tooltip>
      {popoverEl !== null && createPortal(popoverEl, document.body)}
    </>
  );
};
