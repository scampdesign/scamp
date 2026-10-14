import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useListField } from '@store/hooks/useListField';
import { useMixedFields } from '@store/hooks/useMixedFields';
import { selectionPatchers } from '@store/selectionPatch';
import { SECTION_FITS } from '@lib/multiEdit';
import { useGroupToggle, useResolvedElement } from '@store/useResolvedElement';
import { FILTER_DEFAULTS, FILTER_KINDS, FILTER_LABELS, FILTER_RANGES, FILTER_UNITS, } from '@lib/filterKinds';
import { Button } from '../controls/Button';
import { EnumSelect } from '../controls/EnumSelect';
import { NumberInput } from '../controls/NumberInput';
import { Tooltip } from '../controls/Tooltip';
import { Section, Row } from './Section';
import { SectionEmptyState } from './SectionEmptyState';
import sectionStyles from './Section.module.css';
import styles from './FiltersSection.module.css';
const KIND_OPTIONS = FILTER_KINDS.map((kind) => ({ value: kind, label: FILTER_LABELS[kind] }));
const makeFilter = (kind) => ({
    kind,
    value: FILTER_DEFAULTS[kind],
});
/**
 * Per-row tooltip explaining what the filter does. Kept short so the
 * native title attribute renders cleanly across platforms.
 */
const KIND_TOOLTIPS = {
    blur: 'Gaussian blur applied to the element',
    brightness: 'Linear brightness multiplier (100% = unchanged)',
    contrast: 'Contrast multiplier (100% = unchanged)',
    grayscale: 'Desaturate towards grey (100% = fully grey)',
    'hue-rotate': 'Rotate hues around the color wheel',
    invert: 'Invert colors (100% = fully inverted)',
    opacity: 'CSS filter opacity. Distinct from the element opacity property — applied as part of the filter chain.',
    saturate: 'Saturation multiplier (100% = unchanged)',
    sepia: 'Sepia tone (100% = fully sepia)',
};
export const FiltersSection = ({ elementId }) => {
    const element = useResolvedElement(elementId);
    const { patchElement } = selectionPatchers(SECTION_FITS.box);
    const { isMixed } = useMixedFields(SECTION_FITS.box);
    const filtersMixed = isMixed('filters');
    const backdropMixed = isMixed('backdropFilters');
    // Hide the eye when no filters are defined (or already off).
    const groupToggle = useGroupToggle(elementId, 'filters', (element?.filters.length ?? 0) > 0 ||
        (element?.backdropFilters.length ?? 0) > 0);
    const filtersField = useListField(() => (filtersMixed ? [] : element?.filters ?? []), (next) => patchElement(elementId, { filters: next }));
    const backdropField = useListField(() => (backdropMixed ? [] : element?.backdropFilters ?? []), (next) => patchElement(elementId, { backdropFilters: next }));
    if (!element)
        return null;
    const filters = filtersMixed ? [] : element.filters;
    const backdropFilters = backdropMixed ? [] : element.backdropFilters;
    // The backdrop subsection is gated behind a session-local toggle so
    // the common case stays compact. Once the user adds a row the
    // toggle implicitly flips on; we also reflect any pre-existing
    // backdrop list via the initial state.
    const [backdropOpen, setBackdropOpen] = useState(backdropFilters.length > 0);
    const handleBackdropToggle = (next) => {
        setBackdropOpen(next);
        if (!next && backdropFilters.length > 0) {
            patchElement(elementId, { backdropFilters: [] });
        }
    };
    return (_jsxs(Section, { title: "Filters", collapsible: true, defaultOpen: filters.length > 0 || backdropFilters.length > 0, elementId: elementId, groupToggle: groupToggle, fields: ['filters', 'backdropFilters'], cssProperties: ['filter', 'backdrop-filter'], children: [filters.length === 0 && _jsx(SectionEmptyState, { testId: "filters-empty", children: filtersMixed ? 'Mixed' : undefined }), filters.map((filter, idx) => (_jsx(FilterRow, { index: idx, filter: filter, onChange: (patch) => filtersField.update(idx, patch), onRemove: () => filtersField.remove(idx) }, idx))), _jsx(Row, { label: "", children: _jsx(Button, { variant: "addRow", onClick: () => filtersField.add(makeFilter('blur')), children: "+ Add filter" }) }), _jsx("div", { className: styles.backdropDivider }), _jsxs("div", { className: styles.backdropHeader, children: [_jsx("span", { className: styles.backdropTitle, children: "Backdrop filter" }), _jsx(Tooltip, { label: "Backdrop filter applies effects to content behind this element. Requires a partially transparent background to be visible.", children: _jsxs("label", { className: styles.backdropToggle, children: [_jsx("input", { type: "checkbox", checked: backdropOpen, onChange: (e) => handleBackdropToggle(e.target.checked) }), _jsx("span", { children: "Enable" })] }) })] }), backdropOpen && (_jsxs(_Fragment, { children: [backdropFilters.length === 0 && (_jsx("div", { className: sectionStyles.row, children: _jsx("span", { className: styles.backdropHint, children: "Requires partially transparent background to be visible." }) })), backdropFilters.map((filter, idx) => (_jsx(FilterRow, { index: idx, filter: filter, onChange: (patch) => backdropField.update(idx, patch), onRemove: () => backdropField.remove(idx) }, idx))), _jsx(Row, { label: "", children: _jsx(Button, { variant: "addRow", onClick: () => backdropField.add(makeFilter('blur')), children: "+ Add backdrop filter" }) })] }))] }));
};
const FilterRow = ({ index, filter, onChange, onRemove, }) => {
    const unit = FILTER_UNITS[filter.kind];
    const range = FILTER_RANGES[filter.kind];
    const handleKindChange = (next) => {
        // Reset the value to the new kind's canonical default rather than
        // re-interpreting the old number under the new unit — switching
        // from blur(50px) to brightness should not produce brightness(50%).
        onChange({ kind: next, value: FILTER_DEFAULTS[next] });
    };
    return (_jsxs("div", { className: styles.filterRow, children: [_jsxs("div", { className: styles.rowHeader, children: [_jsxs("span", { className: styles.rowTitle, children: ["Filter ", index + 1] }), _jsx(Tooltip, { label: `Remove filter ${index + 1}`, children: _jsx(Button, { variant: "removeRow", onClick: onRemove, ariaLabel: `Remove filter ${index + 1}`, children: "\u00D7" }) })] }), _jsxs(Row, { label: "", children: [_jsx(EnumSelect, { value: filter.kind, options: KIND_OPTIONS, onChange: handleKindChange, title: KIND_TOOLTIPS[filter.kind] }), _jsx(NumberInput, { suffix: unit, title: KIND_TOOLTIPS[filter.kind], value: filter.value, onChange: (value) => value !== undefined && onChange({ value }), min: range.min, max: range.max })] })] }));
};
