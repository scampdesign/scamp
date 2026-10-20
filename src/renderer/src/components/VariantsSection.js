import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { DESKTOP_BREAKPOINT_ID } from '@shared/types';
import { ROOT_ELEMENT_ID, variantKeyParts } from '@lib/element';
import { addVariantAxis, combinationLimitError, keyFor, variantAxisError, } from '@lib/variantAxes';
import { EnumSelect } from './controls/EnumSelect';
import { Section } from './sections/Section';
import { VariantAxisRow } from './VariantAxisRow';
import { VariantInteractions } from './VariantInteractions';
import styles from './VariantsSection.module.css';
const EMPTY_AXES = [];
/** `variant`, then `size`, then `variant2`, … — the first name that's free. */
const nextAxisName = (elements) => {
    for (const name of ['variant', 'size'])
        if (variantAxisError(elements, name) === null)
            return name;
    for (let n = 2;; n += 1)
        if (variantAxisError(elements, `variant${n}`) === null)
            return `variant${n}`;
};
/**
 * The component's variant properties, Figma's Properties section for a
 * component set: which frame you're editing, each axis with its values,
 * and **+ Add property**. The canvas draws every combination as a frame.
 * see docs/plans/component-variants-plan.md, phase 6
 */
export const VariantsSection = () => {
    const axes = useCanvasStore((s) => s.elements[ROOT_ELEMENT_ID]?.variantAxes ?? EMPTY_AXES);
    const nonDesktop = useCanvasStore((s) => s.activeBreakpointId !== DESKTOP_BREAKPOINT_ID);
    const activeVariantKey = useCanvasStore((s) => s.activeVariantKey);
    const setActiveVariant = useCanvasStore((s) => s.setActiveVariant);
    const editVariants = useCanvasStore((s) => s.editVariants);
    const [justAdded, setJustAdded] = useState(null);
    const [error, setError] = useState(null);
    // Routing drops variant edits at other breakpoints, so leave the variant.
    useEffect(() => {
        if (nonDesktop && activeVariantKey !== null)
            setActiveVariant(null);
    }, [nonDesktop, activeVariantKey, setActiveVariant]);
    const picks = Object.fromEntries(axes.map((a) => [a.prop, a.defaultValue]));
    for (const part of activeVariantKey === null ? [] : (variantKeyParts(activeVariantKey) ?? []))
        picks[part.axis] = part.value;
    const handlePick = (prop, value) => setActiveVariant(keyFor(axes, { ...picks, [prop]: value }));
    const handleAddProperty = () => {
        const elements = useCanvasStore.getState().elements;
        const prop = nextAxisName(elements);
        const second = `${prop}-2`;
        const axis = { prop, values: ['default', second], defaultValue: 'default' };
        const problem = combinationLimitError(axes, [...axes, axis]);
        if (problem !== null) {
            setError(problem);
            return;
        }
        setError(null);
        editVariants((current) => addVariantAxis(current, axis), keyFor([...axes, axis], { ...picks, [prop]: second }));
        setJustAdded({ prop, value: second });
    };
    return (_jsx("div", { "data-testid": "variants-section", children: _jsxs(Section, { title: "Variants", collapsible: true, defaultOpen: true, children: [axes.length > 0 && (_jsxs("div", { className: styles.editing, role: "group", "aria-label": "Editing", children: [_jsx("span", { className: styles.editingTitle, children: "Editing" }), axes.map((axis) => (_jsxs("label", { className: styles.pick, children: [_jsx("span", { className: styles.pickName, children: axis.prop }), _jsx(EnumSelect, { value: picks[axis.prop] ?? axis.defaultValue, options: axis.values.map((v) => ({ value: v, label: v })), onChange: (value) => handlePick(axis.prop, value), title: `The ${axis.prop} of the frame you're editing` })] }, axis.prop)))] })), _jsx("div", { className: styles.axes, children: axes.map((axis) => (_jsx(VariantAxisRow, { axis: axis, axes: axes, picks: picks, disabled: nonDesktop, renameOnMount: justAdded?.prop === axis.prop ? justAdded.value : undefined }, axis.prop))) }), axes.length > 0 && _jsx(VariantInteractions, { axes: axes, picks: picks, disabled: nonDesktop }), _jsx("button", { type: "button", className: styles.addAxis, onClick: handleAddProperty, disabled: nonDesktop, title: nonDesktop ? 'Variants are edited at the desktop breakpoint' : undefined, children: axes.length === 0 ? '+ Add variant' : '+ Add property' }), error !== null && (_jsx("span", { className: styles.error, role: "alert", children: error }))] }) }));
};
