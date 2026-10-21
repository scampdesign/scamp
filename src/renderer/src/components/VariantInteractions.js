import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import { useCanvasStore } from '@store/canvasSlice';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { classNameFor } from '@lib/generateCode';
import { TRIGGER_LABEL, addVariantInteraction, interactionError, isCssTrigger, removeVariantInteraction, } from '@lib/variantInteractions';
import { usePopover } from '../hooks/usePopover';
import { EnumSelect } from './controls/EnumSelect';
import { Section } from './sections/Section';
import styles from './VariantsSection.module.css';
const CSS_TRIGGERS = ['hover', 'press', 'focus'];
const RUNTIME_TRIGGERS = ['click', 'outside', 'escape'];
const NONE = [];
const POPOVER = { width: 240, desiredMaxHeight: 320, align: 'right' };
/**
 * The component's interactions, as Figma has them: **+** on the header
 * opens a panel with a **Trigger** and an **Action** (Change to), and
 * each interaction is one line. A new one starts from the frame being
 * edited. Hover, press, and focus are CSS; click, a click outside, and
 * Escape need the Scamp framework's handler, so only its projects offer
 * them. see docs/plans/component-variants-plan.md, phase 7
 */
export const VariantInteractions = ({ axes, picks, disabled }) => {
    const interactions = useCanvasStore((s) => s.elements[ROOT_ELEMENT_ID]?.variantInteractions ?? NONE);
    const elements = useCanvasStore((s) => s.elements);
    const isFramework = useCanvasStore((s) => s.projectFormat === 'scamp');
    const editVariants = useCanvasStore((s) => s.editVariants);
    const [trigger, setTrigger] = useState('hover');
    const [target, setTarget] = useState(ROOT_ELEMENT_ID);
    // `axis=value`, the value the action changes to.
    const [destination, setDestination] = useState('');
    const [error, setError] = useState(null);
    const popover = usePopover({ position: POPOVER });
    const triggers = isFramework ? [...CSS_TRIGGERS, ...RUNTIME_TRIGGERS] : CSS_TRIGGERS;
    const destinations = axes.flatMap((a) => a.values
        .filter((v) => v !== picks[a.prop])
        .map((v) => ({ value: `${a.prop}=${v}`, label: axes.length > 1 ? `${a.prop}: ${v}` : v })));
    const nameOf = (id) => {
        const el = elements[id ?? ROOT_ELEMENT_ID];
        return el === undefined || el.id === ROOT_ELEMENT_ID ? 'component' : classNameFor(el);
    };
    const describe = (i) => `${TRIGGER_LABEL[i.trigger]}${i.trigger === 'click' ? ` ${nameOf(i.target)}` : ''} · ${i.from ?? 'any'} → ${i.to}`;
    const handleOpen = () => {
        if (popover.open) {
            popover.setOpen(false);
            return;
        }
        setTrigger('hover');
        setTarget(ROOT_ELEMENT_ID);
        setDestination(destinations[0]?.value ?? '');
        setError(null);
        popover.setOpen(true);
    };
    const handleAdd = () => {
        const at = destination.indexOf('=');
        const axis = destination.slice(0, at);
        const interaction = {
            axis,
            from: picks[axis] ?? null,
            trigger,
            to: destination.slice(at + 1),
            ...(trigger === 'click' && target !== ROOT_ELEMENT_ID ? { target } : {}),
        };
        const problem = interactionError(axes, interaction);
        if (problem !== null) {
            setError(problem);
            return;
        }
        editVariants((current) => addVariantInteraction(current, interaction));
        popover.setOpen(false);
    };
    const plus = (_jsx("button", { ref: popover.triggerRef, type: "button", className: styles.headerButton, onClick: handleOpen, disabled: disabled, "aria-label": "Add interaction", "aria-expanded": popover.open, title: "Add interaction", children: _jsx(IconPlus, { size: 14 }) }));
    return (_jsxs("div", { "data-testid": "variant-interactions", children: [_jsx(Section, { title: "Interactions", titleAccessory: plus, children: interactions.length > 0 && (_jsx("ul", { className: styles.interactionList, children: interactions.map((i) => (_jsxs("li", { className: styles.interaction, children: [_jsx("span", { className: styles.interactionText, title: describe(i), children: describe(i) }), _jsx("button", { type: "button", className: styles.headerButton, onClick: () => editVariants((current) => removeVariantInteraction(current, i)), "aria-label": `Remove ${describe(i)}`, title: "Remove interaction", disabled: disabled, children: _jsx(IconMinus, { size: 14 }) })] }, describe(i)))) })) }), popover.open && popover.position !== null && (_jsxs("div", { ref: popover.popoverRef, className: styles.interactionPopover, role: "dialog", "aria-label": "New interaction", style: {
                    left: popover.position.left,
                    top: popover.position.top,
                    bottom: popover.position.bottom,
                    maxHeight: popover.position.maxHeight,
                }, children: [_jsxs("div", { className: styles.popoverRow, children: [_jsx("span", { className: styles.popoverLabel, children: "Trigger" }), _jsx(EnumSelect, { value: trigger, options: triggers.map((t) => ({ value: t, label: TRIGGER_LABEL[t] })), onChange: setTrigger, title: "Trigger" })] }), trigger === 'click' && (_jsxs("div", { className: styles.popoverRow, children: [_jsx("span", { className: styles.popoverLabel, children: "On" }), _jsx(EnumSelect, { value: target, options: [
                                    { value: ROOT_ELEMENT_ID, label: 'The component' },
                                    ...Object.values(elements)
                                        .filter((el) => el.id !== ROOT_ELEMENT_ID)
                                        .map((el) => ({ value: el.id, label: classNameFor(el) })),
                                ], onChange: setTarget, title: "The element clicked" })] })), _jsxs("div", { className: styles.popoverRow, children: [_jsx("span", { className: styles.popoverLabel, children: "Action" }), _jsx(EnumSelect, { value: destination, options: destinations, onChange: setDestination, title: "Change to" })] }), _jsxs("span", { className: styles.interactionNote, children: ["From ", picks[destination.slice(0, destination.indexOf('='))] ?? 'this frame', ", the frame you're editing.", isCssTrigger(trigger) ? '' : ' Runs in the browser through the Scamp framework.'] }), error !== null && (_jsx("span", { className: styles.error, role: "alert", children: error })), _jsx("button", { type: "button", className: styles.popoverAdd, onClick: handleAdd, disabled: destination === '', children: "Add" })] }))] }));
};
