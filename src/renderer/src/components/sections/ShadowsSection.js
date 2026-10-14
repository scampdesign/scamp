import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo } from 'react';
import { IconShadow } from '@tabler/icons-react';
import { useColorPickerContext, } from '@store/hooks/useColorPickerContext';
import { useListField } from '@store/hooks/useListField';
import { useMixedFields } from '@store/hooks/useMixedFields';
import { selectionPatchers } from '@store/selectionPatch';
import { SECTION_FITS } from '@lib/multiEdit';
import { useGroupToggle, useResolvedElement } from '@store/useResolvedElement';
import { combineShadowColor, splitShadowColor } from '@lib/parsers';
import { parseBoxShadowShorthand } from '@lib/parsers/boxShadow';
import { tokensForField } from '@lib/tokensForField';
import { Button } from '../controls/Button';
import { ColorInput } from '../controls/ColorInput';
import { NumberInput } from '../controls/NumberInput';
import { PresetMenu } from '../controls/PresetMenu';
import { SegmentedControl } from '../controls/SegmentedControl';
import { Tooltip } from '../controls/Tooltip';
import { Section, Row } from './Section';
import { SectionEmptyState } from './SectionEmptyState';
import styles from './ShadowsSection.module.css';
const DEFAULT_NEW_SHADOW = {
    offsetX: 0,
    offsetY: 4,
    blur: 8,
    spread: 0,
    color: 'rgba(0, 0, 0, 0.15)',
    inset: false,
};
const INSET_OPTIONS = [
    { value: 'outset', label: 'Outset' },
    { value: 'inset', label: 'Inset' },
];
export const ShadowsSection = ({ elementId }) => {
    const element = useResolvedElement(elementId);
    const { patchElement } = selectionPatchers(SECTION_FITS.box);
    const { isMixed } = useMixedFields(SECTION_FITS.box);
    // Selected elements with different shadows show none; adding one replaces them all.
    const shadowsMixed = isMixed('boxShadows') || isMixed('boxShadowToken');
    const colorContext = useColorPickerContext();
    const groupToggle = useGroupToggle(elementId, 'shadow', (element?.boxShadows.length ?? 0) > 0 || element?.boxShadowToken !== undefined);
    const shadowField = useListField(() => (shadowsMixed ? [] : element?.boxShadows ?? []), (next) => patchElement(elementId, shadowsMixed ? { boxShadows: next, boxShadowToken: undefined } : { boxShadows: next }));
    const shadowTokens = useMemo(() => tokensForField('shadow', colorContext.themeTokens), [colorContext.themeTokens]);
    if (!element)
        return null;
    const shadows = shadowsMixed ? [] : element.boxShadows;
    /**
     * Apply a shadow token as a PRESET: resolve its box-shadow value into
     * structured rows, replacing whatever the element currently has. The
     * element model stores shadows structurally (no `var()`), so this is a
     * one-time application rather than a live token link.
     * see docs/archive/2026-07-23-design-system-plan.md
     */
    const applyShadowPreset = (name) => {
        const token = shadowTokens.find((t) => t.name === name);
        if (!token)
            return;
        const parsed = parseBoxShadowShorthand(token.value);
        if (parsed === null)
            return;
        patchElement(elementId, { boxShadows: parsed, boxShadowToken: undefined });
    };
    // A shadow linked to a theme token: shown as the token, which follows
    // the theme. Detach copies its current value into editable layers.
    const linked = shadowsMixed ? undefined : element.boxShadowToken;
    const linkedName = linked === undefined ? null : (/var\(\s*(--[\w-]+)/.exec(linked)?.[1] ?? linked);
    const handleDetach = () => {
        const value = colorContext.themeTokens.find((t) => t.name === linkedName)?.value;
        const parsed = value === undefined ? null : parseBoxShadowShorthand(value);
        patchElement(elementId, { boxShadows: parsed ?? [], boxShadowToken: undefined });
    };
    // The shadow preset picker sits in the section header, left of the
    // expand chevron (PresetMenu renders nothing when there are no tokens).
    const shadowPreset = (_jsx(PresetMenu, { icon: _jsx(IconShadow, { size: 14, stroke: 1.75 }), ariaLabel: "Apply shadow preset", testId: "shadow-preset-select", 
        // Name only — a full box-shadow value is too long/noisy for this
        // compact preset menu (the shadow renders on the canvas anyway).
        options: shadowTokens.map((t) => ({
            value: t.name,
            label: t.name,
        })), onSelect: applyShadowPreset }));
    return (_jsxs(Section, { title: "Shadow", collapsible: true, defaultOpen: shadows.length > 0 || linked !== undefined, elementId: elementId, groupToggle: groupToggle, groupAccessory: shadowPreset, fields: ['boxShadows', 'boxShadowToken'], cssProperties: ['box-shadow'], children: [linked !== undefined && (_jsx(Row, { label: "", children: _jsxs("div", { className: styles.linkedToken, "data-testid": "shadow-token", children: [_jsx("span", { className: styles.linkedName, title: linked, children: linkedName }), _jsx(Tooltip, { label: "Detach \u2014 copy the token's shadow into layers you can edit", children: _jsx(Button, { variant: "ghost", onClick: handleDetach, children: "Detach" }) }), _jsx(Tooltip, { label: "Remove the shadow", children: _jsx(Button, { variant: "ghost", onClick: () => patchElement(elementId, { boxShadowToken: undefined }), children: "Remove" }) })] }) })), linked === undefined && shadows.length === 0 && _jsx(SectionEmptyState, { testId: "shadows-empty", children: shadowsMixed ? 'Mixed' : undefined }), shadows.map((shadow, idx) => (_jsx(ShadowRow, { index: idx, shadow: shadow, elementId: elementId, onChange: (patch) => shadowField.update(idx, patch), onRemove: () => shadowField.remove(idx), colorContext: colorContext }, idx))), linked === undefined && (_jsx(Row, { label: "", children: _jsx(Button, { variant: "addRow", onClick: () => shadowField.add({ ...DEFAULT_NEW_SHADOW }), children: "+ Add shadow" }) }))] }));
};
const ShadowRow = ({ index, shadow, elementId, onChange, onRemove, colorContext, }) => {
    return (_jsxs("div", { className: styles.shadowRow, children: [_jsxs("div", { className: styles.rowHeader, children: [_jsxs("span", { className: styles.rowTitle, children: ["Shadow ", index + 1, shadow.inset && (_jsx(Tooltip, { label: "Inset shadow \u2014 drawn inside the box", children: _jsx("span", { className: styles.insetIcon, "aria-hidden": "true", children: "\u25E7" }) }))] }), _jsx(Tooltip, { label: "Remove shadow", children: _jsx(Button, { variant: "removeRow", onClick: onRemove, ariaLabel: `Remove shadow ${index + 1}`, children: "\u00D7" }) })] }), _jsx(Row, { label: "", children: _jsx(SegmentedControl, { value: shadow.inset ? 'inset' : 'outset', options: INSET_OPTIONS, onChange: (next) => onChange({ inset: next === 'inset' }), title: "Inset shadows are drawn inside the box rather than around it" }) }), _jsxs(Row, { label: "", children: [_jsx(NumberInput, { prefix: "X", title: "X offset", value: shadow.offsetX, onChange: (value) => value !== undefined && onChange({ offsetX: value }) }), _jsx(NumberInput, { prefix: "Y", title: "Y offset", value: shadow.offsetY, onChange: (value) => value !== undefined && onChange({ offsetY: value }) })] }), _jsxs(Row, { label: "", children: [_jsx(NumberInput, { prefix: "B", title: "Blur radius", value: shadow.blur, onChange: (value) => value !== undefined && onChange({ blur: value }), min: 0 }), _jsx(NumberInput, { prefix: "S", title: "Spread radius", value: shadow.spread, onChange: (value) => value !== undefined && onChange({ spread: value }) })] }), _jsx(Row, { label: "", children: _jsx(ShadowColorRow, { color: shadow.color, elementId: elementId, onChange: (color) => onChange({ color }), colorContext: colorContext }) })] }));
};
/**
 * Splits the stored shadow color into a base hex (rendered through
 * ColorInput with `disableAlpha`) and an opacity percentage (rendered
 * as a separate NumberInput). Edits to either control re-combine into
 * an `rgba(...)` string the data layer stores.
 *
 * Token / named-color values can't be combined with a separate alpha
 * (you'd lose the reference), so the opacity input is disabled in
 * that case — the picker still lets the user switch back to a hex.
 */
const ShadowColorRow = ({ color, elementId, onChange, colorContext, }) => {
    const split = splitShadowColor(color);
    const opacityPercent = Math.round(split.alpha * 100);
    const handleColorChange = (next) => {
        const nextSplit = splitShadowColor(next);
        if (!nextSplit.decomposable) {
            // var() / token / named — keep verbatim, can't carry separate
            // opacity here.
            onChange(next);
            return;
        }
        // The picker's `disableAlpha` keeps the SketchPicker's alpha at 1,
        // but the user might still type an `rgba(..., 0.5)` into the text
        // field. When they do, treat that explicit alpha as the new
        // opacity; otherwise carry the existing opacity over so changing
        // the hue doesn't reset the slider.
        const alpha = nextSplit.hasExplicitAlpha ? nextSplit.alpha : split.alpha;
        onChange(combineShadowColor(nextSplit.base, alpha));
    };
    const handleOpacityChange = (percent) => {
        if (percent === undefined)
            return;
        const clamped = Math.max(0, Math.min(100, percent));
        if (!split.decomposable)
            return;
        onChange(combineShadowColor(split.base, clamped / 100));
    };
    return (_jsxs(_Fragment, { children: [_jsx(ColorInput, { value: color, onChange: handleColorChange, historyElementId: elementId, historyPropertyKey: "boxShadows", presetColors: colorContext.presetColors, tokens: colorContext.themeTokens, onOpenTheme: colorContext.onOpenTheme, disableAlpha: true }), _jsx(NumberInput, { prefix: "O", suffix: "%", title: split.decomposable
                    ? 'Shadow opacity (0–100)'
                    : 'Opacity is disabled for token / named-color shadows. Pick a hex color to enable.', value: opacityPercent, onChange: handleOpacityChange, min: 0, max: 100, disabled: !split.decomposable })] }));
};
