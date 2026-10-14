import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createPortal } from 'react-dom';
import { resolveTokenChain } from '@lib/resolveToken';
import { tokensForField } from '@lib/tokensForField';
import { usePopover } from '../hooks/usePopover';
import { FontPicker } from './controls/FontPicker';
import { TokenOrNumberInput } from './controls/TokenOrNumberInput';
import { Tooltip } from './controls/Tooltip';
import { WeightSelect } from './controls/WeightSelect';
import styles from './TextStyleRow.module.css';
/** Standard one-line preview text, shown after the style name. */
const SAMPLE_TEXT = 'The quick brown fox jumps over the lazy dog';
/**
 * One text style in the theme panel: a live preview of the style (the name
 * rendered in its own font / size / weight / …) that opens a popover editor
 * with the same typography controls as the WYSIWYG panel — the design-system
 * equivalent of the colour-swatch → picker pattern.
 * see docs/archive/2026-07-23-design-system-plan.md
 */
export const TextStyleRow = ({ style, tokens, allFonts, onProp, onRename, onDelete, }) => {
    const popover = usePopover({
        // Closes on outside click, but not when the click lands in a nested
        // FontPicker / token dropdown — those portal outside this popover's DOM
        // yet are still "inside" from the user's point of view.
        position: { width: 260, desiredMaxHeight: 320, align: 'right' },
        ignoreNestedPopovers: true,
    });
    const resolve = (v) => v === null ? undefined : (resolveTokenChain(v, tokens) ?? v);
    const previewStyle = {
        fontFamily: resolve(style.family),
        fontSize: resolve(style.size),
        fontWeight: resolve(style.weight),
        lineHeight: resolve(style.leading),
        letterSpacing: resolve(style.tracking),
    };
    const popoverEl = popover.open && popover.position ? (_jsxs("div", { ref: popover.popoverRef, className: styles.popover, style: {
            left: popover.position.left,
            top: popover.position.top,
            bottom: popover.position.bottom,
            width: popover.position.width,
            maxHeight: popover.position.maxHeight,
        }, children: [_jsxs("div", { className: styles.popoverHeader, children: [_jsx("input", { type: "text", className: styles.nameInput, defaultValue: style.label, "aria-label": `Text style name for ${style.label}`, onBlur: (e) => onRename(e.target.value), onKeyDown: (e) => {
                            if (e.key === 'Enter')
                                e.currentTarget.blur();
                        } }), _jsx("button", { type: "button", className: styles.closeButton, onClick: () => popover.setOpen(false), "aria-label": "Close text style editor", children: "\u00D7" })] }), _jsx("div", { className: styles.fieldRow, children: _jsx(FontPicker, { value: style.family ?? '', fonts: allFonts, fontTokens: tokensForField('fontFamily', tokens), onChange: (v) => onProp('family', v), title: "Font family" }) }), _jsxs("div", { className: styles.fieldRow, children: [_jsx(TokenOrNumberInput, { prefix: "Sz", title: "Font size", value: style.size ?? undefined, tokens: tokensForField('fontSize', tokens), defaultUnit: "px", onChange: (v) => onProp('size', v ?? ''), placeholder: "size" }), _jsx(WeightSelect, { value: style.weight ?? '400', onChange: (v) => onProp('weight', v), title: "Font weight" })] }), _jsxs("div", { className: styles.fieldRow, children: [_jsx(TokenOrNumberInput, { prefix: "LH", title: "Line height", value: style.leading ?? undefined, tokens: tokensForField('lineHeight', tokens), defaultUnit: "", onChange: (v) => onProp('leading', v ?? ''), placeholder: "auto" }), _jsx(TokenOrNumberInput, { prefix: "LS", title: "Letter spacing", value: style.tracking ?? undefined, tokens: tokensForField('letterSpacing', tokens), defaultUnit: "px", onChange: (v) => onProp('tracking', v ?? ''), placeholder: "0" })] })] })) : null;
    return (_jsxs("div", { className: styles.row, "data-token-row": true, "data-text-style": style.name, children: [_jsx("button", { ref: popover.triggerRef, type: "button", className: styles.preview, onClick: popover.toggle, title: `Edit ${style.label}`, "aria-label": `Edit ${style.label} text style`, children: _jsxs("span", { className: styles.previewSample, style: previewStyle, children: [style.label, " \u2014 ", SAMPLE_TEXT] }) }), _jsx(Tooltip, { label: "Delete text style", children: _jsx("button", { type: "button", className: styles.delete, onClick: onDelete, "aria-label": `Delete ${style.label} text style`, children: "\u00D7" }) }), popoverEl !== null && createPortal(popoverEl, document.body)] }));
};
