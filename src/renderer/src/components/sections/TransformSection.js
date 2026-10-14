import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useListField } from '@store/hooks/useListField';
import { useMixedFields } from '@store/hooks/useMixedFields';
import { selectionPatchers } from '@store/selectionPatch';
import { SECTION_FITS } from '@lib/multiEdit';
import { useGroupToggle, useResolvedElement } from '@store/useResolvedElement';
import { Button } from '../controls/Button';
import { EnumSelect } from '../controls/EnumSelect';
import { NumberInput } from '../controls/NumberInput';
import { PrefixSuffixInput } from '../controls/PrefixSuffixInput';
import { Tooltip } from '../controls/Tooltip';
import { Section, Row } from './Section';
import { SectionEmptyState } from './SectionEmptyState';
import styles from './TransformSection.module.css';
const KIND_OPTIONS = [
    { value: 'translate', label: 'Translate' },
    { value: 'rotate', label: 'Rotate' },
    { value: 'scale', label: 'Scale' },
    { value: 'skew', label: 'Skew' },
];
const KIND_TOOLTIPS = {
    translate: 'Move the element by an offset without affecting layout (px, %, or a token)',
    rotate: 'Rotate around the transform origin, in degrees',
    scale: 'Scale from the transform origin (1 = unchanged)',
    skew: 'Slant along each axis, in degrees',
};
/**
 * A no-op default so adding a row never moves the element; the user
 * dials in what they want. A visible default (a rotation) would jump
 * the element the moment the row appeared.
 */
const makeTransform = (kind) => {
    switch (kind) {
        case 'translate':
            return { kind, x: '0px', y: '0px' };
        case 'rotate':
            return { kind, angle: 0 };
        case 'scale':
            return { kind, x: 1, y: 1 };
        case 'skew':
            return { kind, x: 0, y: 0 };
    }
};
/** Common `transform-origin` values; anything else shows as Custom. */
const ORIGIN_PRESETS = [
    { value: '', label: 'Center' },
    { value: 'top left', label: 'Top left' },
    { value: 'top', label: 'Top' },
    { value: 'top right', label: 'Top right' },
    { value: 'left', label: 'Left' },
    { value: 'right', label: 'Right' },
    { value: 'bottom left', label: 'Bottom left' },
    { value: 'bottom', label: 'Bottom' },
    { value: 'bottom right', label: 'Bottom right' },
];
const CUSTOM_ORIGIN = '__custom__';
export const TransformSection = ({ elementId }) => {
    const element = useResolvedElement(elementId);
    const { patchElement } = selectionPatchers(SECTION_FITS.box);
    const { isMixed } = useMixedFields(SECTION_FITS.box);
    const transformsMixed = isMixed('transforms');
    const groupToggle = useGroupToggle(elementId, 'transform', (element?.transforms.length ?? 0) > 0 ||
        (element?.transformOrigin.length ?? 0) > 0);
    const listField = useListField(() => (transformsMixed ? [] : element?.transforms ?? []), (next) => patchElement(elementId, { transforms: next }));
    if (!element)
        return null;
    const transforms = transformsMixed ? [] : element.transforms;
    const origin = element.transformOrigin;
    const originIsPreset = ORIGIN_PRESETS.some((p) => p.value === origin);
    const originOptions = originIsPreset
        ? ORIGIN_PRESETS
        : [...ORIGIN_PRESETS, { value: CUSTOM_ORIGIN, label: 'Custom…' }];
    return (_jsxs(Section, { title: "Transform", collapsible: true, defaultOpen: transforms.length > 0 || origin.length > 0, elementId: elementId, groupToggle: groupToggle, fields: ['transforms', 'transformOrigin'], cssProperties: ['transform', 'transform-origin'], children: [transforms.length === 0 && _jsx(SectionEmptyState, { testId: "transform-empty", children: transformsMixed ? 'Mixed' : undefined }), transforms.map((transform, idx) => (_jsx(TransformRow, { index: idx, transform: transform, onReplace: (next) => patchElement(elementId, {
                    transforms: transforms.map((t, i) => (i === idx ? next : t)),
                }), onRemove: () => listField.remove(idx) }, idx))), _jsx(Row, { label: "", children: _jsx(Button, { variant: "addRow", onClick: () => listField.add(makeTransform('translate')), children: "+ Add transform" }) }), _jsx("div", { className: styles.originDivider }), _jsx("div", { className: styles.originTitle, children: "Origin" }), _jsxs(Row, { label: "", tooltip: "The point rotate, scale and skew pivot around (transform-origin). Center is the CSS default.", children: [_jsx(EnumSelect, { value: originIsPreset ? origin : CUSTOM_ORIGIN, mixed: isMixed('transformOrigin'), options: originOptions, onChange: (value) => {
                            if (value === CUSTOM_ORIGIN)
                                return;
                            patchElement(elementId, { transformOrigin: value });
                        }, title: "Transform origin" }), _jsx(PrefixSuffixInput, { prefix: "At", title: "transform-origin \u2014 any CSS value, e.g. 20px 40px or 100% 0", value: origin, mixed: isMixed('transformOrigin'), placeholder: "50% 50%", onCommit: (value) => patchElement(elementId, { transformOrigin: value.trim() }) })] })] }));
};
const TransformRow = ({ index, transform, onReplace, onRemove, }) => {
    // Switching kind resets to that kind's no-op rather than carrying
    // numbers across — a 45° rotation is not a 45px translate.
    const handleKindChange = (next) => {
        if (next !== transform.kind)
            onReplace(makeTransform(next));
    };
    return (_jsxs("div", { className: styles.transformRow, children: [_jsxs("div", { className: styles.rowHeader, children: [_jsxs("span", { className: styles.rowTitle, children: ["Transform ", index + 1] }), _jsx(Tooltip, { label: `Remove transform ${index + 1}`, children: _jsx(Button, { variant: "removeRow", onClick: onRemove, ariaLabel: `Remove transform ${index + 1}`, children: "\u00D7" }) })] }), _jsxs(Row, { label: "", children: [_jsx(EnumSelect, { value: transform.kind, options: KIND_OPTIONS, onChange: handleKindChange, title: KIND_TOOLTIPS[transform.kind] }), transform.kind === 'rotate' && (_jsx(NumberInput, { prefix: "Angle", suffix: "deg", title: KIND_TOOLTIPS.rotate, value: transform.angle, onChange: (value) => value !== undefined && onReplace({ kind: 'rotate', angle: value }) }))] }), transform.kind === 'translate' && (_jsxs(Row, { label: "", children: [_jsx(PrefixSuffixInput, { prefix: "X", title: "Horizontal offset \u2014 px, %, or var(--token)", value: transform.x, placeholder: "0px", onCommit: (value) => onReplace({ ...transform, x: value.trim() || '0px' }) }), _jsx(PrefixSuffixInput, { prefix: "Y", title: "Vertical offset \u2014 px, %, or var(--token)", value: transform.y, placeholder: "0px", onCommit: (value) => onReplace({ ...transform, y: value.trim() || '0px' }) })] })), transform.kind === 'scale' && (_jsxs(Row, { label: "", children: [_jsx(NumberInput, { prefix: "X", title: "Horizontal scale factor (1 = unchanged)", value: transform.x, onChange: (value) => value !== undefined && onReplace({ ...transform, x: value }) }), _jsx(NumberInput, { prefix: "Y", title: "Vertical scale factor (1 = unchanged)", value: transform.y, onChange: (value) => value !== undefined && onReplace({ ...transform, y: value }) })] })), transform.kind === 'skew' && (_jsxs(Row, { label: "", children: [_jsx(NumberInput, { prefix: "X", suffix: "deg", title: "Horizontal skew angle", value: transform.x, onChange: (value) => value !== undefined && onReplace({ ...transform, x: value }) }), _jsx(NumberInput, { prefix: "Y", suffix: "deg", title: "Vertical skew angle", value: transform.y, onChange: (value) => value !== undefined && onReplace({ ...transform, y: value }) })] }))] }));
};
