import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { IconPercentage } from '@tabler/icons-react';
import { selectionPatchers } from '@store/selectionPatch';
import { useMixedFields } from '@store/hooks/useMixedFields';
import { SECTION_FITS } from '@lib/multiEdit';
import { useResolvedElement } from '@store/useResolvedElement';
import { BlendModeSelect } from '../controls/BlendModeSelect';
import { NumberInput } from '../controls/NumberInput';
import { SegmentedControl } from '../controls/SegmentedControl';
import { Section, Row } from './Section';
const VISIBILITY_OPTIONS = [
    { value: 'visible', label: 'Visible' },
    { value: 'hidden', label: 'Hidden' },
    { value: 'none', label: 'None' },
];
/** Map 0–1 opacity in the model to a 0–100 integer percent for the UI. */
const toPercent = (opacity) => Math.round(opacity * 100);
export const VisibilitySection = ({ elementId }) => {
    const element = useResolvedElement(elementId);
    const { patchElement } = selectionPatchers(SECTION_FITS.box);
    const { isMixed } = useMixedFields(SECTION_FITS.box);
    if (!element)
        return null;
    const currentPercent = toPercent(element.opacity);
    const commitPercent = (next) => {
        if (next === undefined)
            return;
        const clamped = Math.max(0, Math.min(100, next));
        patchElement(elementId, { opacity: clamped / 100 });
    };
    return (_jsxs(Section, { title: "Visibility", elementId: elementId, fields: ['opacity', 'visibilityMode', 'mixBlendMode'], cssProperties: ['opacity', 'visibility', 'mix-blend-mode'], children: [_jsx(Row, { label: "Opacity", children: _jsx(NumberInput, { value: currentPercent, mixed: isMixed('opacity'), onChange: commitPercent, min: 0, max: 100, title: "Opacity (%)", suffix: _jsx(IconPercentage, { size: 14, stroke: 1.75 }) }) }), _jsx(Row, { label: "Display", children: _jsx(SegmentedControl, { value: element.visibilityMode, mixed: isMixed('visibilityMode'), options: VISIBILITY_OPTIONS, onChange: (value) => patchElement(elementId, { visibilityMode: value }), title: "Visibility" }) }), _jsx(Row, { label: "Blend", children: _jsx(BlendModeSelect, { value: element.mixBlendMode, mixed: isMixed('mixBlendMode'), onChange: (value) => patchElement(elementId, { mixBlendMode: value }), title: "Mix blend mode \u2014 how this element blends with content behind it" }) })] }));
};
