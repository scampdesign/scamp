import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { validatePageName } from '@shared/pageName';
import styles from './PageNameInput.module.css';
/**
 * Inline text input for naming or renaming a page. Used by the
 * "Add page" flow and the "Duplicate" flow. Autofocuses on mount;
 * validates on every keystroke and surfaces the first error under the
 * field. Enter confirms (when valid), Escape cancels, blur cancels.
 */
export const PageNameInput = ({ initialValue = '', existingNames, onConfirm, onCancel, selectRange, error: externalError, busy = false, }) => {
    const inputRef = useRef(null);
    const [draft, setDraft] = useState(initialValue);
    const [touched, setTouched] = useState(false);
    useEffect(() => {
        const el = inputRef.current;
        if (!el)
            return;
        el.focus();
        if (selectRange) {
            const [start, end] = selectRange;
            el.setSelectionRange(start, end);
        }
        else {
            el.select();
        }
    }, [selectRange]);
    const validation = validatePageName(draft, existingNames);
    // Don't show validation errors until the user has typed at least once —
    // a seeded value that happens to collide shouldn't flash red immediately.
    const visibleError = externalError ??
        (touched && !validation.ok ? validation.error : null);
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (validation.ok && !busy)
                onConfirm(validation.value);
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
            return;
        }
        // Stop propagation so shortcuts (V, R, T, I) don't fire while typing.
        e.stopPropagation();
    };
    return (_jsxs("div", { className: styles.wrap, children: [_jsx("input", { ref: inputRef, type: "text", className: `${styles.input} ${visibleError ? styles.inputError : ''}`, value: draft, onChange: (e) => {
                    setDraft(e.target.value);
                    if (!touched)
                        setTouched(true);
                }, onBlur: () => {
                    // Blur cancels rather than confirming. This matches the element
                    // rename input and prevents accidental creations when the user
                    // clicks away mid-typing.
                    if (!busy)
                        onCancel();
                }, onKeyDown: handleKeyDown, disabled: busy, placeholder: "page-name", spellCheck: false, autoCapitalize: "off", autoCorrect: "off" }), visibleError && _jsx("div", { className: styles.error, children: visibleError }), busy && _jsx("div", { className: styles.busy, children: "Working\u2026" })] }));
};
