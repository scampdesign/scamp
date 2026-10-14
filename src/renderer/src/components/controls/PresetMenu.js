import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { createPortal } from 'react-dom';
import { usePopover } from '../../hooks/usePopover';
import { Tooltip } from './Tooltip';
import styles from './TokenOrNumberInput.module.css';
const POPOVER_WIDTH = 200;
const POPOVER_MAX_HEIGHT = 320;
/**
 * A compact icon button that opens a popover menu of presets — used for
 * the Typography "Text style" and Shadow "Preset" pickers so both apply a
 * multi-value preset from a single, consistent icon control. Shares the
 * token-picker button + popover styling. Renders nothing when there are
 * no options. see docs/archive/2026-07-23-design-system-plan.md
 */
export const PresetMenu = ({ icon, ariaLabel, options, onSelect, active = false, testId, }) => {
    const popover = usePopover({
        position: {
            width: POPOVER_WIDTH,
            desiredMaxHeight: POPOVER_MAX_HEIGHT,
            align: 'right',
        },
    });
    if (options.length === 0)
        return null;
    const handleSelect = (value) => {
        onSelect(value);
        popover.setOpen(false);
    };
    const popoverEl = popover.open && popover.position ? (_jsx("div", { ref: popover.popoverRef, className: styles.popover, style: {
            left: popover.position.left,
            top: popover.position.top,
            bottom: popover.position.bottom,
            width: popover.position.width,
            maxHeight: popover.position.maxHeight,
        }, role: "listbox", children: _jsx("div", { className: styles.tokenList, children: options.map((opt) => (_jsxs("button", { type: "button", role: "option", className: styles.tokenRow, onMouseDown: (e) => e.preventDefault(), onClick: () => handleSelect(opt.value), children: [_jsx("span", { className: styles.tokenRowName, children: opt.label }), opt.hint !== undefined && (_jsx("span", { className: styles.tokenRowValue, children: opt.hint }))] }, opt.value))) }) })) : null;
    return (_jsxs(_Fragment, { children: [_jsx(Tooltip, { label: ariaLabel, children: _jsx("button", { ref: popover.triggerRef, type: "button", className: `${styles.tokenButton} ${active ? styles.tokenButtonActive : ''}`, onClick: (e) => {
                        // Stop propagation so the trigger works when nested inside a
                        // collapsible section's header <button> (Shadows) without
                        // also toggling the section.
                        e.stopPropagation();
                        popover.toggle();
                    }, onMouseDown: (e) => e.preventDefault(), "aria-label": ariaLabel, "aria-haspopup": "listbox", "data-testid": testId, children: icon }) }), popoverEl !== null && createPortal(popoverEl, document.body)] }));
};
