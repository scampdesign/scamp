import { createPortal } from 'react-dom';
import { IconColorSwatch } from '@tabler/icons-react';
import type { ThemeToken } from '@shared/types';
import { usePopover } from '../../hooks/usePopover';
import styles from './TokenOrNumberInput.module.css';

type Props = {
  /** Theme tokens to offer. Caller filters to length-shaped ones. */
  tokens: ReadonlyArray<ThemeToken>;
  /** Fired with the chosen token's full `var(--name)` reference. */
  onSelect: (varRef: string) => void;
  /** Called from the empty-state "Add token" button when the popover
   *  opens with no tokens to pick from. */
  onOpenTheme?: () => void;
  /** True when the field already has a token applied — paints the icon
   *  in the accent color so the user can see at a glance that a token
   *  is in effect. */
  active?: boolean;
  /** Accessible label for the trigger button. Defaults to "Pick token". */
  ariaLabel?: string;
};

const POPOVER_WIDTH = 200;
const POPOVER_MAX_HEIGHT = 320;

/**
 * Inline icon button that opens a popover of available tokens. Used by
 * the spacing-typed controls (padding/margin/border-width/border-radius
 * and the singular gap properties) so the user can apply a project
 * spacing token without dropping into raw-CSS mode.
 *
 * Styling is shared with `TokenOrNumberInput` — same button + popover
 * shapes so the spacing picker looks identical to the typography one.
 *
 * The component is presentation only — it doesn't know about
 * `SpaceTuple` / `SpaceValue`. The caller decides whether the picked
 * token applies to a single value, all four sides, or something else.
 */
export const SpaceTokenButton = ({
  tokens,
  onSelect,
  onOpenTheme,
  active = false,
  ariaLabel = 'Pick token',
}: Props): JSX.Element => {
  const popover = usePopover<HTMLButtonElement>({
    position: {
      width: POPOVER_WIDTH,
      desiredMaxHeight: POPOVER_MAX_HEIGHT,
      align: 'right',
    },
  });

  const handleSelect = (token: ThemeToken): void => {
    onSelect(`var(${token.name})`);
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
        {tokens.length === 0 ? (
          <div className={styles.empty}>
            <div>No spacing tokens yet.</div>
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
                // Prevent the parent input from losing focus on
                // mousedown — the parent's blur handler would commit
                // a stale draft and overwrite the token we're about
                // to set.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(token)}
              >
                <span className={styles.tokenRowIcon} aria-hidden="true">
                  <IconColorSwatch size={14} />
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
      <button
        ref={popover.triggerRef}
        type="button"
        className={`${styles.tokenButton} ${active ? styles.tokenButtonActive : ''}`}
        onClick={popover.toggle}
        // Same mousedown swallow as the rows above — clicking the
        // trigger while the parent input is focused must NOT blur it,
        // otherwise PrefixSuffixInput would commit and we'd race
        // with our own onSelect.
        onMouseDown={(e) => e.preventDefault()}
        aria-label={ariaLabel}
      >
        <IconColorSwatch size={14} />
      </button>
      {popoverEl !== null && createPortal(popoverEl, document.body)}
    </>
  );
};
