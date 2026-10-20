import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { classNameFor } from '@lib/generateCode';
import { TRIGGER_LABEL, addVariantInteraction, interactionError, isCssTrigger, removeVariantInteraction, } from '@lib/variantInteractions';
import { EnumSelect } from './controls/EnumSelect';
import styles from './VariantsSection.module.css';
const CSS_TRIGGERS = ['hover', 'press', 'focus'];
const RUNTIME_TRIGGERS = ['click', 'outside', 'escape'];
const ANY = '*';
const NONE = [];
/**
 * The component's interactions, Figma's **Change to**: on a trigger, a
 * property goes from one value to another by itself. Hover, press, and
 * focus are CSS; click, a click outside, and Escape need the Scamp
 * framework's handler, so only its projects offer them.
 * see docs/plans/component-variants-plan.md, phase 7
 */
export const VariantInteractions = ({ axes, picks, disabled }) => {
    const interactions = useCanvasStore((s) => s.elements[ROOT_ELEMENT_ID]?.variantInteractions ?? NONE);
    const elements = useCanvasStore((s) => s.elements);
    const isFramework = useCanvasStore((s) => s.projectFormat === 'scamp');
    const editVariants = useCanvasStore((s) => s.editVariants);
    const [draft, setDraft] = useState(null);
    const [error, setError] = useState(null);
    const triggers = isFramework ? [...CSS_TRIGGERS, ...RUNTIME_TRIGGERS] : CSS_TRIGGERS;
    const nameOf = (id) => {
        const el = elements[id ?? ROOT_ELEMENT_ID];
        return el === undefined || el.id === ROOT_ELEMENT_ID ? 'the component' : classNameFor(el);
    };
    const startDraft = () => {
        const axis = axes[0];
        if (axis === undefined)
            return;
        const from = picks[axis.prop] ?? axis.defaultValue;
        const to = axis.values.find((v) => v !== from && v !== axis.defaultValue) ?? axis.values.find((v) => v !== from) ?? from;
        setError(null);
        setDraft({ axis: axis.prop, from, trigger: 'hover', to });
    };
    const handleAdd = () => {
        if (draft === null)
            return;
        // Only a click has an element; the root is the whole component.
        const { target, ...rest } = draft;
        const interaction = draft.trigger === 'click' && target !== undefined && target !== ROOT_ELEMENT_ID ? { ...rest, target } : rest;
        const problem = interactionError(axes, interaction);
        if (problem !== null) {
            setError(problem);
            return;
        }
        editVariants((current) => addVariantInteraction(current, interaction));
        setDraft(null);
        setError(null);
    };
    const draftAxis = draft === null ? undefined : axes.find((a) => a.prop === draft.axis);
    return (_jsxs("div", { className: styles.interactions, "data-testid": "variant-interactions", children: [_jsx("span", { className: styles.axisName, children: "Interactions" }), interactions.length > 0 && (_jsx("ul", { className: styles.interactionList, children: interactions.map((i, index) => (_jsxs("li", { className: styles.interaction, children: [_jsxs("span", { children: [TRIGGER_LABEL[i.trigger], i.trigger === 'click' ? ` on ${nameOf(i.target)}` : '', ": ", i.axis, " ", i.from ?? 'any', " \u2192 ", i.to] }), _jsx("button", { type: "button", className: styles.iconButton, onClick: () => editVariants((current) => removeVariantInteraction(current, index)), "aria-label": `Remove ${TRIGGER_LABEL[i.trigger].toLowerCase()} ${i.from ?? 'any'} to ${i.to}`, disabled: disabled, children: "Remove" })] }, `${i.trigger}-${i.axis}-${i.from ?? ANY}-${i.target ?? ''}`))) })), draft === null ? (_jsx("button", { type: "button", className: styles.addAxis, onClick: startDraft, disabled: disabled, children: "+ Add interaction" })) : (_jsxs("div", { className: styles.interactionForm, role: "group", "aria-label": "New interaction", children: [_jsx(EnumSelect, { value: draft.trigger, options: triggers.map((t) => ({ value: t, label: TRIGGER_LABEL[t] })), onChange: (trigger) => setDraft({ ...draft, trigger }), title: "Trigger" }), axes.length > 1 && (_jsx(EnumSelect, { value: draft.axis, options: axes.map((a) => ({ value: a.prop, label: a.prop })), onChange: (axis) => {
                            const next = axes.find((a) => a.prop === axis);
                            if (next === undefined)
                                return;
                            setDraft({ ...draft, axis, from: next.defaultValue, to: next.values.find((v) => v !== next.defaultValue) ?? next.defaultValue });
                        }, title: "Property" })), _jsx(EnumSelect, { value: draft.from ?? ANY, options: [{ value: ANY, label: 'From any value' }, ...(draftAxis?.values ?? []).map((v) => ({ value: v, label: `From ${v}` }))], onChange: (from) => setDraft({ ...draft, from: from === ANY ? null : from }), title: "Changes from" }), _jsx(EnumSelect, { value: draft.to, options: (draftAxis?.values ?? []).map((v) => ({ value: v, label: `Change to ${v}` })), onChange: (to) => setDraft({ ...draft, to }), title: "Changes to" }), draft.trigger === 'click' && (_jsx(EnumSelect, { value: draft.target ?? ROOT_ELEMENT_ID, options: [
                            { value: ROOT_ELEMENT_ID, label: 'On the component' },
                            ...Object.values(elements)
                                .filter((el) => el.id !== ROOT_ELEMENT_ID)
                                .map((el) => ({ value: el.id, label: `On ${classNameFor(el)}` })),
                        ], onChange: (target) => setDraft({ ...draft, target }), title: "The element clicked" })), isCssTrigger(draft.trigger) ? null : (_jsx("span", { className: styles.interactionNote, children: "Runs in the browser through the Scamp framework." })), _jsxs("div", { className: styles.valueActions, children: [_jsx("button", { type: "button", className: styles.confirmCancel, onClick: handleAdd, children: "Add" }), _jsx("button", { type: "button", className: styles.confirmCancel, onClick: () => setDraft(null), children: "Cancel" })] })] })), error !== null && (_jsx("span", { className: styles.error, role: "alert", children: error }))] }));
};
