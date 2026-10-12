import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from 'react';
import styles from '../ProjectShell.module.css';
/** Inline name field for a page group. Enter or blur saves; Escape cancels. */
export const PageGroupNameInput = ({ initialValue, nameError, onConfirm, onCancel }) => {
    const [draft, setDraft] = useState(initialValue);
    const [error, setError] = useState(null);
    // Escape unmounts the input, and the blur that follows mustn't save.
    const settled = useRef(false);
    const handleConfirm = () => {
        if (settled.current)
            return;
        const problem = nameError(draft);
        if (problem !== null) {
            setError(problem);
            return;
        }
        settled.current = true;
        onConfirm(draft.trim());
    };
    return (_jsxs("div", { className: styles.groupRename, children: [_jsx("input", { className: styles.groupNameInput, "aria-label": "Group name", value: draft, autoFocus: true, onFocus: (e) => e.currentTarget.select(), onChange: (e) => {
                    setDraft(e.target.value);
                    setError(null);
                }, onKeyDown: (e) => {
                    if (e.key === 'Enter')
                        handleConfirm();
                    if (e.key === 'Escape') {
                        settled.current = true;
                        onCancel();
                    }
                }, onBlur: handleConfirm }), error !== null && _jsx("span", { className: styles.groupNameError, children: error })] }));
};
