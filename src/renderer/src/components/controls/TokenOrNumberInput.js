import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconColorSwatch } from '@tabler/icons-react';
import { usePopover } from '../../hooks/usePopover';
import { Tooltip } from './Tooltip';
import styles from './TokenOrNumberInput.module.css';
const VAR_RE = /^var\(\s*(--[\w-]+)\s*\)$/;
const UNIT_RE = /(px|rem|em|%|pt|vw|vh|vmin|vmax|ch|ex)$/i;
const UNITLESS_NUMBER_RE = /^-?\d*\.?\d+$/;
const POPOVER_WIDTH = 180;
const POPOVER_MAX_HEIGHT = 320;
const isVarRef = (value) => value !== undefined && VAR_RE.test(value.trim());
const tokenNameFromValue = (value) => {
    const m = value.match(VAR_RE);
    return m ? (m[1] ?? '') : '';
};
/**
 * Commit-time formatter. Applies Figma-style px fallback when the user
 * typed a bare number and the field expects a unit. Returns `null`
 * when the input can't be interpreted (caller reverts).
 */
const formatCommit = (draft, defaultUnit) => {
    const trimmed = draft.trim();
    if (trimmed.length === 0)
        return '';
    // Token refs pass through.
    if (VAR_RE.test(trimmed))
        return trimmed;
    // Bare number: maybe append the default unit.
    if (UNITLESS_NUMBER_RE.test(trimmed)) {
        if (defaultUnit === '')
            return trimmed;
        return `${trimmed}${defaultUnit}`;
    }
    // Number with unit → accept.
    if (UNIT_RE.test(trimmed) && /\d/.test(trimmed))
        return trimmed;
    // Anything else we don't know how to format.
    return null;
};
export const TokenOrNumberInput = ({ value, tokens, defaultUnit, onChange, onOpenTheme, prefix, placeholder, title, mixed = false, }) => {
    const shown = mixed ? '' : value ?? '';
    const [draft, setDraft] = useState(shown);
    const popover = usePopover({
        position: {
            width: POPOVER_WIDTH,
            desiredMaxHeight: POPOVER_MAX_HEIGHT,
            align: 'right',
        },
    });
    useEffect(() => {
        setDraft(shown);
    }, [shown]);
    const commit = () => {
        if (mixed && draft.trim().length === 0)
            return;
        const formatted = formatCommit(draft, defaultUnit);
        if (formatted === null) {
            // Revert on invalid.
            setDraft(value ?? '');
            return;
        }
        if (formatted === '') {
            if (value !== undefined)
                onChange(undefined);
            return;
        }
        if (formatted !== value || mixed)
            onChange(formatted);
        setDraft(formatted);
    };
    // Arrow-key stepping: only meaningful for numeric values. Parse the
    // draft, step by 1 (or 10 with shift), preserve the unit suffix.
    const step = (delta) => {
        if (mixed)
            return;
        const match = draft.trim().match(/^(-?\d*\.?\d+)(\D*)$/);
        if (!match)
            return;
        const n = Number(match[1]);
        if (!Number.isFinite(n))
            return;
        const unit = match[2] ?? '';
        const next = `${n + delta}${unit}`;
        setDraft(next);
        onChange(next);
    };
    const handleKeyDown = (e) => {
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
    const clearToken = () => {
        onChange(undefined);
    };
    const selectToken = (token) => {
        onChange(`var(${token.name})`);
        popover.setOpen(false);
    };
    const rowEl = (_jsxs("div", { className: styles.row, "data-prefix": prefix, children: [prefix && _jsx("span", { className: styles.prefix, children: prefix }), showingToken ? (_jsxs("div", { className: styles.pill, children: [_jsx("span", { className: styles.pillLabel, children: tokenName }), _jsx("button", { type: "button", className: styles.pillClear, onClick: clearToken, "aria-label": "Clear token", children: "\u00D7" })] })) : (_jsx("input", { type: "text", inputMode: "decimal", className: styles.input, value: draft, placeholder: mixed ? 'Mixed' : placeholder, onChange: (e) => setDraft(e.target.value), onBlur: commit, onKeyDown: handleKeyDown })), _jsx("button", { ref: popover.triggerRef, type: "button", className: `${styles.tokenButton} ${showingToken ? styles.tokenButtonActive : ''}`, onClick: popover.toggle, "aria-label": "Pick token", children: _jsx(IconColorSwatch, { size: 14, stroke: 1.75 }) })] }));
    // Render the popover into `document.body` via a portal so it can't
    // be affected by any `transform`, `filter`, or `overflow` on parent
    // components — it positions purely against the viewport.
    const popoverEl = popover.open && popover.position ? (_jsx("div", { ref: popover.popoverRef, className: styles.popover, style: {
            left: popover.position.left,
            top: popover.position.top,
            bottom: popover.position.bottom,
            width: popover.position.width,
            maxHeight: popover.position.maxHeight,
        }, role: "listbox", children: tokens.length === 0 ? (_jsxs("div", { className: styles.empty, children: [_jsx("div", { children: "No matching tokens yet." }), onOpenTheme && (_jsx("button", { type: "button", className: styles.addTokenButton, onClick: () => {
                        popover.setOpen(false);
                        onOpenTheme();
                    }, children: "+ Add token" }))] })) : (_jsx("div", { className: styles.tokenList, children: tokens.map((token) => (_jsxs("button", { type: "button", role: "option", className: styles.tokenRow, onMouseDown: (e) => e.preventDefault(), onClick: () => selectToken(token), children: [_jsx("span", { className: styles.tokenRowIcon, "aria-hidden": "true", children: _jsx(IconColorSwatch, { size: 14, stroke: 1.75 }) }), _jsx("span", { className: styles.tokenRowName, children: token.name }), _jsx("span", { className: styles.tokenRowValue, children: token.value })] }, token.name))) })) })) : null;
    return (_jsxs(_Fragment, { children: [title ? _jsx(Tooltip, { label: title, children: rowEl }) : rowEl, popoverEl && createPortal(popoverEl, document.body)] }));
};
