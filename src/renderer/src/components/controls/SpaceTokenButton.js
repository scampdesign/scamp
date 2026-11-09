import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { createPortal } from 'react-dom';
import { IconColorSwatch } from '@tabler/icons-react';
import { usePopover } from '../../hooks/usePopover';
import styles from './TokenOrNumberInput.module.css';
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
export const SpaceTokenButton = ({ tokens, onSelect, onOpenTheme, active = false, ariaLabel = 'Pick token', }) => {
    const popover = usePopover({
        position: {
            width: POPOVER_WIDTH,
            desiredMaxHeight: POPOVER_MAX_HEIGHT,
            align: 'right',
        },
    });
    const handleSelect = (token) => {
        onSelect(`var(${token.name})`);
        popover.setOpen(false);
    };
    const popoverEl = popover.open && popover.position ? (_jsx("div", { ref: popover.popoverRef, className: styles.popover, style: {
            left: popover.position.left,
            top: popover.position.top,
            bottom: popover.position.bottom,
            width: popover.position.width,
            maxHeight: popover.position.maxHeight,
        }, role: "listbox", children: tokens.length === 0 ? (_jsxs("div", { className: styles.empty, children: [_jsx("div", { children: "No spacing tokens yet." }), onOpenTheme && (_jsx("button", { type: "button", className: styles.addTokenButton, onClick: () => {
                        popover.setOpen(false);
                        onOpenTheme();
                    }, children: "+ Add token" }))] })) : (_jsx("div", { className: styles.tokenList, children: tokens.map((token) => (_jsxs("button", { type: "button", role: "option", className: styles.tokenRow, 
                // Prevent the parent input from losing focus on
                // mousedown — the parent's blur handler would commit
                // a stale draft and overwrite the token we're about
                // to set.
                onMouseDown: (e) => e.preventDefault(), onClick: () => handleSelect(token), children: [_jsx("span", { className: styles.tokenRowIcon, "aria-hidden": "true", children: _jsx(IconColorSwatch, { size: 14 }) }), _jsx("span", { className: styles.tokenRowName, children: token.name }), _jsx("span", { className: styles.tokenRowValue, children: token.value })] }, token.name))) })) })) : null;
    return (_jsxs(_Fragment, { children: [_jsx("button", { ref: popover.triggerRef, type: "button", className: `${styles.tokenButton} ${active ? styles.tokenButtonActive : ''}`, onClick: popover.toggle, 
                // Same mousedown swallow as the rows above — clicking the
                // trigger while the parent input is focused must NOT blur it,
                // otherwise PrefixSuffixInput would commit and we'd race
                // with our own onSelect.
                onMouseDown: (e) => e.preventDefault(), "aria-label": ariaLabel, children: _jsx(IconColorSwatch, { size: 14 }) }), popoverEl !== null && createPortal(popoverEl, document.body)] }));
};
