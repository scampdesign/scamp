import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { createPortal } from 'react-dom';
import { IconArrowAutofitContent, IconArrowsHorizontal, IconArrowsVertical, IconPercentage, IconRulerMeasure, } from '@tabler/icons-react';
import { SIZE_TYPE_OPTIONS, sizeTypeLabel, } from '@lib/sizeType';
import { usePopover } from '../../hooks/usePopover';
import { HugIcon } from './HugIcon';
import styles from './SizeTypeSelect.module.css';
const ICON = 14;
/**
 * Glyph for a size type. Fill / Hug depend on the axis (horizontal for
 * width, vertical for height). vh / vw / custom have no dedicated icon,
 * so the short unit label is shown instead.
 */
const typeIcon = (type, orientation) => {
    switch (type) {
        case 'px':
            return _jsx(IconRulerMeasure, { size: ICON });
        case 'percent':
            return _jsx(IconPercentage, { size: ICON });
        case 'fill':
            return orientation === 'horizontal' ? (_jsx(IconArrowsHorizontal, { size: ICON })) : (_jsx(IconArrowsVertical, { size: ICON }));
        case 'hug':
            return _jsx(HugIcon, { orientation: orientation, size: ICON });
        case 'auto':
            return _jsx(IconArrowAutofitContent, { size: ICON });
        default:
            return sizeTypeLabel(type);
    }
};
const POPOVER_WIDTH = 132;
const POPOVER_MAX_HEIGHT = 280;
/**
 * The right-side unit/mode picker inside a Size field. The trigger shows
 * an icon for the current type; the popover menu lists icon + label for
 * each type. Presentation only — the caller maps the chosen type onto the
 * element's stored size.
 */
export const SizeTypeSelect = ({ value, orientation, onSelect, disabledTypes, ariaLabel = 'Size type', }) => {
    const popover = usePopover({
        position: {
            width: POPOVER_WIDTH,
            desiredMaxHeight: POPOVER_MAX_HEIGHT,
            align: 'right',
        },
    });
    const handleSelect = (type) => {
        onSelect(type);
        popover.setOpen(false);
    };
    const popoverEl = popover.open && popover.position ? (_jsx("div", { ref: popover.popoverRef, className: styles.popover, style: {
            left: popover.position.left,
            top: popover.position.top,
            bottom: popover.position.bottom,
            width: popover.position.width,
            maxHeight: popover.position.maxHeight,
        }, role: "listbox", children: SIZE_TYPE_OPTIONS.map((opt) => {
            const disabled = disabledTypes?.has(opt.type) ?? false;
            const active = opt.type === value;
            return (_jsxs("button", { type: "button", role: "option", "aria-selected": active, "aria-disabled": disabled, className: `${styles.item} ${active ? styles.itemActive : ''} ${disabled ? styles.itemDisabled : ''}`, 
                // Don't blur the input the picker lives in.
                onMouseDown: (e) => e.preventDefault(), onClick: () => {
                    if (!disabled)
                        handleSelect(opt.type);
                }, children: [_jsx("span", { className: styles.itemIcon, "aria-hidden": true, children: typeIcon(opt.type, orientation) }), opt.label] }, opt.type));
        }) })) : null;
    return (_jsxs(_Fragment, { children: [_jsx("button", { ref: popover.triggerRef, type: "button", className: styles.trigger, onClick: popover.toggle, onMouseDown: (e) => e.preventDefault(), "aria-label": ariaLabel, "data-size-type": value, children: typeIcon(value, orientation) }), popoverEl !== null && createPortal(popoverEl, document.body)] }));
};
