import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { variantKey } from '@lib/element';
import { addVariantValue, nextValueName, parseVariantKey, removeVariantAxis, removeVariantValue, renameVariantAxis, renameVariantValue, variantAxisError, variantValueError, } from '@lib/variantAxes';
import styles from './VariantBar.module.css';
const sameTarget = (a, b) => a !== null && a.kind === b.kind && (a.kind === 'axis' || (b.kind === 'value' && a.value === b.value));
/**
 * One variant axis: its values as segments. Click a value to edit it,
 * double-click a name to rename it, and use × to remove the selected
 * value or the axis. see docs/plans/component-variants-plan.md
 */
export const VariantAxisRow = ({ axis, disabled, renameOnMount }) => {
    const activeVariantKey = useCanvasStore((s) => s.activeVariantKey);
    const setActiveVariant = useCanvasStore((s) => s.setActiveVariant);
    const editVariants = useCanvasStore((s) => s.editVariants);
    const [renaming, setRenaming] = useState(renameOnMount === undefined ? null : { target: { kind: 'value', value: renameOnMount }, draft: renameOnMount });
    const [confirming, setConfirming] = useState(null);
    const [error, setError] = useState(null);
    const active = activeVariantKey === null ? null : parseVariantKey(activeVariantKey);
    // Another axis's value leaves this one at its default.
    const selected = active !== null && active.axis === axis.prop ? active.value : axis.defaultValue;
    const keyFor = (value) => (value === axis.defaultValue ? null : variantKey(axis.prop, value));
    const startRename = (target) => {
        setConfirming(null);
        setError(null);
        setRenaming({ target, draft: target.kind === 'axis' ? axis.prop : target.value });
    };
    const commitRename = () => {
        if (renaming === null)
            return;
        const { target, draft } = renaming;
        const name = draft.trim();
        if (target.kind === 'axis') {
            if (name !== axis.prop) {
                const problem = variantAxisError(useCanvasStore.getState().elements, name, axis.prop);
                if (problem !== null)
                    return setError(problem);
                const nextKey = active !== null && active.axis === axis.prop ? variantKey(name, active.value) : undefined;
                editVariants((elements) => renameVariantAxis(elements, axis.prop, name), nextKey);
            }
        }
        else if (name !== target.value) {
            const problem = variantValueError(axis, name, target.value);
            if (problem !== null)
                return setError(problem);
            const nextKey = selected === target.value && target.value !== axis.defaultValue ? variantKey(axis.prop, name) : undefined;
            editVariants((elements) => renameVariantValue(elements, axis.prop, target.value, name), nextKey);
        }
        setRenaming(null);
        setError(null);
    };
    const handleRenameKeyDown = (e) => {
        if (e.key === 'Enter')
            commitRename();
        if (e.key === 'Escape') {
            setRenaming(null);
            setError(null);
        }
    };
    const handleAddValue = () => {
        const name = nextValueName(axis);
        // The new value starts as a copy of the look being edited.
        editVariants((elements) => addVariantValue(elements, axis.prop, name, selected), variantKey(axis.prop, name));
        startRename({ kind: 'value', value: name });
    };
    const handleRemove = (target) => {
        setConfirming(null);
        if (target.kind === 'axis')
            editVariants((elements) => removeVariantAxis(elements, axis.prop));
        else
            editVariants((elements) => removeVariantValue(elements, axis.prop, target.value));
    };
    const renameInput = (label) => (_jsx("input", { className: styles.renameInput, "aria-label": label, autoFocus: true, value: renaming?.draft ?? '', onChange: (e) => setRenaming((r) => (r === null ? r : { ...r, draft: e.target.value })), onKeyDown: handleRenameKeyDown, onBlur: commitRename }));
    const confirmRow = (target, text) => (_jsxs("span", { className: styles.confirm, role: "group", "aria-label": "Confirm removal", children: [_jsx("span", { children: text }), _jsx("button", { type: "button", className: styles.confirmRemove, onClick: () => handleRemove(target), children: "Remove" }), _jsx("button", { type: "button", className: styles.confirmCancel, onClick: () => setConfirming(null), children: "Cancel" })] }));
    const axisTarget = { kind: 'axis' };
    return (_jsxs("div", { className: styles.row, "data-testid": `variant-axis-${axis.prop}`, children: [sameTarget(renaming?.target ?? null, axisTarget) ? (renameInput('Axis name')) : (_jsx("span", { className: styles.axisName, onDoubleClick: () => startRename(axisTarget), title: "Double-click to rename", children: axis.prop })), _jsxs("div", { className: styles.segments, role: "radiogroup", "aria-label": `${axis.prop} value`, children: [axis.values.map((value) => {
                        const target = { kind: 'value', value };
                        if (sameTarget(renaming?.target ?? null, target))
                            return _jsx("span", { children: renameInput('Value name') }, value);
                        const isSelected = value === selected;
                        return (_jsx("button", { type: "button", role: "radio", "aria-checked": isSelected, disabled: disabled, className: `${styles.segment} ${isSelected ? styles.segmentActive : ''}`, onClick: () => setActiveVariant(keyFor(value)), onDoubleClick: () => startRename(target), title: value === axis.defaultValue ? 'The default value. Double-click to rename' : 'Double-click to rename', children: value }, value));
                    }), _jsx("button", { type: "button", className: styles.segment, disabled: disabled, onClick: handleAddValue, "aria-label": `Add a ${axis.prop} value`, title: `Add a ${axis.prop} value`, children: "+" })] }), confirming !== null && confirming.kind === 'value'
                ? confirmRow(confirming, `Remove ${confirming.value} and its styles?`)
                : confirming !== null
                    ? confirmRow(confirming, `Remove ${axis.prop}, its values, and their styles?`)
                    : (_jsxs(_Fragment, { children: [selected !== axis.defaultValue && (_jsx("button", { type: "button", className: styles.iconButton, onClick: () => setConfirming({ kind: 'value', value: selected }), "aria-label": `Remove ${selected}`, title: `Remove ${selected}`, children: "Remove value" })), _jsx("button", { type: "button", className: styles.iconButton, onClick: () => setConfirming(axisTarget), "aria-label": `Remove the ${axis.prop} axis`, title: `Remove the ${axis.prop} axis`, children: "Remove axis" })] })), error !== null && (_jsx("span", { className: styles.error, role: "alert", children: error }))] }));
};
