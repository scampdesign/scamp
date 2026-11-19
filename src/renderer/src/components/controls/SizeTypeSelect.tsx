import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  IconArrowAutofitContent,
  IconArrowsHorizontal,
  IconArrowsVertical,
  IconPercentage,
  IconRulerMeasure,
} from '@tabler/icons-react';

import {
  SIZE_TYPE_OPTIONS,
  sizeTypeLabel,
  type SizeType,
} from '@lib/sizeType';

import { usePopover } from '../../hooks/usePopover';
import { HugIcon } from './HugIcon';
import styles from './SizeTypeSelect.module.css';

const ICON = 14;

/**
 * Glyph for a size type. Fill / Hug depend on the axis (horizontal for
 * width, vertical for height). vh / vw / custom have no dedicated icon,
 * so the short unit label is shown instead.
 */
const typeIcon = (
  type: SizeType,
  orientation: 'horizontal' | 'vertical'
): ReactNode => {
  switch (type) {
    case 'px':
      return <IconRulerMeasure size={ICON} />;
    case 'percent':
      return <IconPercentage size={ICON} />;
    case 'fill':
      return orientation === 'horizontal' ? (
        <IconArrowsHorizontal size={ICON} />
      ) : (
        <IconArrowsVertical size={ICON} />
      );
    case 'hug':
      return <HugIcon orientation={orientation} size={ICON} />;
    case 'auto':
      return <IconArrowAutofitContent size={ICON} />;
    default:
      return sizeTypeLabel(type);
  }
};

type Props = {
  /** The field's current type (drives the button icon + active row). */
  value: SizeType;
  /** Axis this field controls — picks the Fill / Hug icon orientation. */
  orientation: 'horizontal' | 'vertical';
  /** Fired with the chosen type when a menu row is clicked. */
  onSelect: (type: SizeType) => void;
  /** Types to render disabled (e.g. Hug / Auto without a flex/grid parent). */
  disabledTypes?: ReadonlySet<SizeType>;
  ariaLabel?: string;
};

const POPOVER_WIDTH = 132;
const POPOVER_MAX_HEIGHT = 280;

/**
 * The right-side unit/mode picker inside a Size field. The trigger shows
 * an icon for the current type; the popover menu lists icon + label for
 * each type. Presentation only — the caller maps the chosen type onto the
 * element's stored size.
 */
export const SizeTypeSelect = ({
  value,
  orientation,
  onSelect,
  disabledTypes,
  ariaLabel = 'Size type',
}: Props): JSX.Element => {
  const popover = usePopover<HTMLButtonElement>({
    position: {
      width: POPOVER_WIDTH,
      desiredMaxHeight: POPOVER_MAX_HEIGHT,
      align: 'right',
    },
  });

  const handleSelect = (type: SizeType): void => {
    onSelect(type);
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
        {SIZE_TYPE_OPTIONS.map((opt) => {
          const disabled = disabledTypes?.has(opt.type) ?? false;
          const active = opt.type === value;
          return (
            <button
              key={opt.type}
              type="button"
              role="option"
              aria-selected={active}
              aria-disabled={disabled}
              className={`${styles.item} ${active ? styles.itemActive : ''} ${
                disabled ? styles.itemDisabled : ''
              }`}
              // Don't blur the input the picker lives in.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (!disabled) handleSelect(opt.type);
              }}
            >
              <span className={styles.itemIcon} aria-hidden>
                {typeIcon(opt.type, orientation)}
              </span>
              {opt.label}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <>
      <button
        ref={popover.triggerRef}
        type="button"
        className={styles.trigger}
        onClick={popover.toggle}
        onMouseDown={(e) => e.preventDefault()}
        aria-label={ariaLabel}
        data-size-type={value}
      >
        {typeIcon(value, orientation)}
      </button>
      {popoverEl !== null && createPortal(popoverEl, document.body)}
    </>
  );
};
