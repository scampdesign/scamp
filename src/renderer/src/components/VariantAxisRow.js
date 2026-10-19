import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { addVariantValue, combinationLimitError, keyFor, makeVariantDefault, moveVariantValue, nextValueName, removeVariantAxis, removeVariantValue, renameVariantAxis, renameVariantValue, variantAxisError, variantValueError, } from '@lib/variantAxes';
import styles from './VariantsSection.module.css';
const sameTarget = (a, b) => a !== null && a.kind === b.kind && (a.kind === 'axis' || (b.kind === 'value' && a.value === b.value));
const DRAG_MIME = 'application/x-scamp-variant-value';
/**
 * One variant property: its values as chips, in order. Click a value to
 * edit that frame, drag one to reorder, double-click a name to rename
 * it. The selected value can be made the default or removed.
 * see docs/plans/component-variants-plan.md, phase 6
 */
export const VariantAxisRow = ({ axis, axes, picks, disabled, renameOnMount }) => {
    const setActiveVariant = useCanvasStore((s) => s.setActiveVariant);
    const editVariants = useCanvasStore((s) => s.editVariants);
    const [renaming, setRenaming] = useState(renameOnMount === undefined ? null : { target: { kind: 'value', value: renameOnMount }, draft: renameOnMount });
    const [confirming, setConfirming] = useState(null);
    const [error, setError] = useState(null);
    const selected = picks[axis.prop] ?? axis.defaultValue;
    /** The axes after replacing this one, and the key `nextPicks` lands on with them. */
    const keyAfter = (next, nextPicks) => {
        const nextAxes = axes.flatMap((a) => (a.prop !== axis.prop ? [a] : next === null ? [] : [next]));
        return keyFor(nextAxes, nextPicks);
    };
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
                const { [axis.prop]: value = axis.defaultValue, ...rest } = picks;
                editVariants((elements) => renameVariantAxis(elements, axis.prop, name), keyAfter({ ...axis, prop: name }, { ...rest, [name]: value }));
            }
        }
        else if (name !== target.value) {
            const problem = variantValueError(axis, name, target.value);
            if (problem !== null)
                return setError(problem);
            const renamed = {
                ...axis,
                values: axis.values.map((v) => (v === target.value ? name : v)),
                defaultValue: axis.defaultValue === target.value ? name : axis.defaultValue,
            };
            editVariants((elements) => renameVariantValue(elements, axis.prop, target.value, name), keyAfter(renamed, { ...picks, [axis.prop]: selected === target.value ? name : selected }));
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
        const grown = { ...axis, values: [...axis.values, name] };
        const problem = combinationLimitError(axes, axes.map((a) => (a.prop === axis.prop ? grown : a)));
        if (problem !== null)
            return setError(problem);
        // The new value starts as a copy of the look being edited.
        editVariants((elements) => addVariantValue(elements, axis.prop, name, selected), keyAfter(grown, { ...picks, [axis.prop]: name }));
        startRename({ kind: 'value', value: name });
    };
    const handleRemove = (target) => {
        setConfirming(null);
        if (target.kind === 'axis') {
            const { [axis.prop]: _dropped, ...rest } = picks;
            editVariants((elements) => removeVariantAxis(elements, axis.prop), keyAfter(null, rest));
            return;
        }
        const shrunk = { ...axis, values: axis.values.filter((v) => v !== target.value) };
        editVariants((elements) => removeVariantValue(elements, axis.prop, target.value), keyAfter(shrunk, { ...picks, [axis.prop]: selected === target.value ? axis.defaultValue : selected }));
    };
    const handleMakeDefault = () => {
        const next = { ...axis, defaultValue: selected, values: [selected, ...axis.values.filter((v) => v !== selected)] };
        editVariants((elements) => makeVariantDefault(elements, axis.prop, selected), keyAfter(next, { ...picks }));
    };
    const handleDrop = (e, toIndex) => {
        const value = e.dataTransfer.getData(DRAG_MIME);
        if (value === '')
            return;
        e.preventDefault();
        editVariants((elements) => moveVariantValue(elements, axis.prop, value, toIndex));
    };
    const renameInput = (label) => (_jsx("input", { className: styles.renameInput, "aria-label": label, autoFocus: true, value: renaming?.draft ?? '', onChange: (e) => setRenaming((r) => (r === null ? r : { ...r, draft: e.target.value })), onKeyDown: handleRenameKeyDown, onBlur: commitRename }));
    const confirmRow = (target, text) => (_jsxs("span", { className: styles.confirm, role: "group", "aria-label": "Confirm removal", children: [_jsx("span", { children: text }), _jsx("button", { type: "button", className: styles.confirmRemove, onClick: () => handleRemove(target), children: "Remove" }), _jsx("button", { type: "button", className: styles.confirmCancel, onClick: () => setConfirming(null), children: "Cancel" })] }));
    const axisTarget = { kind: 'axis' };
    return (_jsxs("div", { className: styles.axis, "data-testid": `variant-axis-${axis.prop}`, children: [_jsxs("div", { className: styles.axisHeader, children: [sameTarget(renaming?.target ?? null, axisTarget) ? (renameInput('Property name')) : (_jsx("span", { className: styles.axisName, onDoubleClick: () => startRename(axisTarget), title: "Double-click to rename", children: axis.prop })), _jsx("button", { type: "button", className: styles.iconButton, onClick: () => setConfirming(axisTarget), "aria-label": `Remove the ${axis.prop} property`, title: `Remove the ${axis.prop} property`, children: "Remove" })] }), _jsxs("div", { className: styles.chips, role: "radiogroup", "aria-label": `${axis.prop} value`, children: [axis.values.map((value, index) => {
                        const target = { kind: 'value', value };
                        if (sameTarget(renaming?.target ?? null, target))
                            return _jsx("span", { children: renameInput('Value name') }, value);
                        const isSelected = value === selected;
                        return (_jsxs("button", { type: "button", role: "radio", "aria-checked": isSelected, disabled: disabled, draggable: !disabled, className: `${styles.chip} ${isSelected ? styles.chipActive : ''}`, onClick: () => setActiveVariant(keyFor(axes, { ...picks, [axis.prop]: value })), onDoubleClick: () => startRename(target), onDragStart: (e) => {
                                e.dataTransfer.setData(DRAG_MIME, value);
                                e.dataTransfer.effectAllowed = 'move';
                            }, onDragOver: (e) => {
                                if (e.dataTransfer.types.includes(DRAG_MIME))
                                    e.preventDefault();
                            }, onDrop: (e) => handleDrop(e, index), title: value === axis.defaultValue ? 'The default. Drag to reorder, double-click to rename' : 'Drag to reorder, double-click to rename', children: [value, value === axis.defaultValue && _jsx("span", { className: styles.defaultMark, "aria-label": "default", children: " \u25CF" })] }, value));
                    }), _jsx("button", { type: "button", className: styles.chip, disabled: disabled, onClick: handleAddValue, "aria-label": `Add a ${axis.prop} value`, title: `Add a ${axis.prop} value`, children: "+" })] }), confirming !== null && confirming.kind === 'value'
                ? confirmRow(confirming, `Remove ${confirming.value} and its styles?`)
                : confirming !== null
                    ? confirmRow(confirming, `Remove ${axis.prop}, its values, and their styles?`)
                    : selected !== axis.defaultValue && (_jsxs("div", { className: styles.valueActions, children: [_jsxs("button", { type: "button", className: styles.iconButton, onClick: handleMakeDefault, disabled: disabled, children: ["Make ", selected, " the default"] }), _jsxs("button", { type: "button", className: styles.iconButton, onClick: () => setConfirming({ kind: 'value', value: selected }), "aria-label": `Remove ${selected}`, children: ["Remove ", selected] })] })), error !== null && (_jsx("span", { className: styles.error, role: "alert", children: error }))] }));
};
