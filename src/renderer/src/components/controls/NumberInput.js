import { jsx as _jsx } from "react/jsx-runtime";
import { PrefixSuffixInput } from './PrefixSuffixInput';
const clamp = (n, min, max) => {
    let out = n;
    if (typeof min === 'number' && out < min)
        out = min;
    if (typeof max === 'number' && out > max)
        out = max;
    return out;
};
/**
 * Numeric input. Thin wrapper over PrefixSuffixInput that handles
 * parsing, clamping, and arrow-key stepping.
 */
export const NumberInput = ({ value, onChange, min, max, placeholder, allowEmpty = false, prefix, suffix, title, disabled = false, computed = false, mixed = false, }) => {
    const stringValue = value === undefined ? '' : String(value);
    const handleCommit = (draft) => {
        if (draft.length === 0) {
            if (allowEmpty && value !== undefined)
                onChange(undefined);
            return;
        }
        const parsed = Number(draft);
        if (!Number.isFinite(parsed))
            return;
        const next = clamp(parsed, min, max);
        if (next !== value || mixed)
            onChange(next);
    };
    const handleArrow = (draft, direction, shift) => {
        const step = (shift ? 10 : 1) * direction;
        const fallback = value !== undefined ? value : typeof min === 'number' ? min : 0;
        const parsed = Number(draft.trim());
        const current = Number.isFinite(parsed) ? parsed : fallback;
        const next = clamp(current + step, min, max);
        if (next !== value)
            onChange(next);
    };
    return (_jsx(PrefixSuffixInput, { value: stringValue, onCommit: handleCommit, onArrow: handleArrow, prefix: prefix, suffix: suffix, placeholder: placeholder, inputMode: "numeric", title: title, disabled: disabled, computed: computed, mixed: mixed }));
};
