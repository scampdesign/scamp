import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useListField } from '@store/hooks/useListField';
import { useMixedFields } from '@store/hooks/useMixedFields';
import { selectionPatchers } from '@store/selectionPatch';
import { SECTION_FITS } from '@lib/multiEdit';
import { useGroupToggle, useResolvedElement } from '@store/useResolvedElement';
import { Button } from '../controls/Button';
import { EnumSelect } from '../controls/EnumSelect';
import { NumberInput } from '../controls/NumberInput';
import { PrefixSuffixInput } from '../controls/PrefixSuffixInput';
import { SegmentedControl } from '../controls/SegmentedControl';
import { Tooltip } from '../controls/Tooltip';
import { Section, Row } from './Section';
import { SectionEmptyState } from './SectionEmptyState';
const PROPERTY_OPTIONS = [
    { value: 'all', label: 'all' },
    { value: 'opacity', label: 'opacity' },
    { value: 'transform', label: 'transform' },
    { value: 'background', label: 'background' },
    { value: 'color', label: 'color' },
    { value: 'border', label: 'border' },
    { value: 'width', label: 'width' },
    { value: 'height', label: 'height' },
];
const NAMED_EASINGS = ['ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out'];
const CUSTOM_EASING_VALUE = '__custom__';
const isNamedEasing = (value) => NAMED_EASINGS.includes(value);
const EASING_OPTIONS = [
    ...NAMED_EASINGS.map((e) => ({ value: e, label: e })),
    { value: CUSTOM_EASING_VALUE, label: 'Custom…' },
];
const UNIT_OPTIONS = [
    { value: 'ms', label: 'ms' },
    { value: 's', label: 's' },
];
/** Convert canonical ms to whatever unit the row is currently displayed in. */
const msToDisplay = (ms, unit) => unit === 's' ? ms / 1000 : ms;
const displayToMs = (n, unit) => {
    if (n === undefined)
        return 0;
    return unit === 's' ? Math.round(n * 1000) : Math.round(n);
};
export const TransitionsSection = ({ elementId }) => {
    const element = useResolvedElement(elementId);
    const { patchElement } = selectionPatchers(SECTION_FITS.box);
    const { isMixed } = useMixedFields(SECTION_FITS.box);
    const transitionsMixed = isMixed('transitions');
    // Per-row, per-axis (duration / delay) display unit. The CSS storage
    // is always canonical ms; the unit is just a UI affordance for typing
    // shorter numbers when the user is working in seconds.
    const [unitState, setUnitState] = useState({});
    // Hide the eye when no transitions are defined (or already off).
    const groupToggle = useGroupToggle(elementId, 'transitions', (element?.transitions.length ?? 0) > 0);
    const transitionsField = useListField(() => (transitionsMixed ? [] : element?.transitions ?? []), (next) => patchElement(elementId, { transitions: next }));
    if (!element)
        return null;
    const transitions = transitionsMixed ? [] : element.transitions;
    const unitFor = (idx) => unitState[idx] ?? { duration: 'ms', delay: 'ms' };
    const setUnit = (idx, axis, unit) => {
        setUnitState((prev) => ({ ...prev, [idx]: { ...unitFor(idx), [axis]: unit } }));
    };
    // Wraps the shared remove to also drop the row's per-row unit state,
    // which is keyed by index and would otherwise leak onto the row that
    // shifts into this slot.
    const removeRow = (idx) => {
        transitionsField.remove(idx);
        setUnitState((prev) => {
            const copy = { ...prev };
            delete copy[idx];
            return copy;
        });
    };
    const addRow = () => {
        transitionsField.add({
            property: 'all',
            durationMs: 200,
            easing: 'ease',
            delayMs: 0,
        });
    };
    return (_jsxs(Section, { title: "Transitions", collapsible: true, defaultOpen: transitions.length > 0, elementId: elementId, groupToggle: groupToggle, fields: ['transitions'], cssProperties: ['transition'], children: [transitions.length === 0 && (_jsx(SectionEmptyState, { testId: "transitions-empty", children: transitionsMixed ? 'Mixed' : undefined })), transitions.map((t, idx) => (_jsx(TransitionRow, { transition: t, unit: unitFor(idx), onChange: (patch) => transitionsField.update(idx, patch), onUnitChange: (axis, unit) => setUnit(idx, axis, unit), onRemove: () => removeRow(idx) }, idx))), _jsx(Row, { label: "", children: _jsx(Button, { variant: "addRow", onClick: addRow, children: "+ Add transition" }) })] }));
};
const TransitionRow = ({ transition, unit, onChange, onUnitChange, onRemove, }) => {
    // Detect whether the stored easing is a named keyword or a custom
    // expression. The dropdown shows `Custom…` for anything outside the
    // named set, and an inline text input lets the user edit the
    // expression directly.
    const easingMode = useMemo(() => isNamedEasing(transition.easing)
        ? transition.easing
        : CUSTOM_EASING_VALUE, [transition.easing]);
    const handleEasingChange = (next) => {
        if (next === CUSTOM_EASING_VALUE) {
            // Seed with a Material-standard cubic-bezier so the input has
            // something parseable to start from.
            onChange({ easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
            return;
        }
        onChange({ easing: next });
    };
    return (_jsxs(_Fragment, { children: [_jsxs(Row, { label: "", children: [_jsx(EnumSelect, { value: transition.property, options: PROPERTY_OPTIONS, onChange: (value) => onChange({ property: value }), title: "Property" }), _jsx(Tooltip, { label: "Remove transition", children: _jsx(Button, { variant: "removeRow", onClick: onRemove, ariaLabel: "Remove transition", children: "\u00D7" }) })] }), _jsxs(Row, { label: "", children: [_jsx(NumberInput, { prefix: "Dur", title: "Duration", value: msToDisplay(transition.durationMs, unit.duration), onChange: (value) => onChange({ durationMs: displayToMs(value, unit.duration) }), min: 0 }), _jsx(SegmentedControl, { value: unit.duration, options: UNIT_OPTIONS, onChange: (next) => onUnitChange('duration', next), title: "Duration unit" })] }), _jsx(Row, { label: "", children: _jsx(EnumSelect, { value: easingMode, options: EASING_OPTIONS, onChange: handleEasingChange, title: "Easing" }) }), easingMode === CUSTOM_EASING_VALUE && (_jsx(Row, { label: "", children: _jsx(PrefixSuffixInput, { value: transition.easing, onCommit: (next) => onChange({ easing: next.trim() || 'ease' }), prefix: "fn", title: "Custom easing expression" }) })), _jsxs(Row, { label: "", children: [_jsx(NumberInput, { prefix: "Delay", title: "Delay", value: msToDisplay(transition.delayMs, unit.delay), onChange: (value) => onChange({ delayMs: displayToMs(value, unit.delay) }), min: 0 }), _jsx(SegmentedControl, { value: unit.delay, options: UNIT_OPTIONS, onChange: (next) => onUnitChange('delay', next), title: "Delay unit" })] })] }));
};
