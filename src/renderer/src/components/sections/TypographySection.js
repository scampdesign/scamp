import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import { runsOf, styleOfRange } from '@lib/textRuns';
import { IconAlignLeft, IconAlignCenter, IconAlignRight, IconTypography, } from '@tabler/icons-react';
import { useCanvasStore } from '@store/canvasSlice';
import { useColorPickerContext } from '@store/hooks/useColorPickerContext';
import { useGroupToggle, useResolvedElement } from '@store/useResolvedElement';
import { useFontsStore, selectAllFonts } from '@store/fontsSlice';
import { buildTextStyles, textStyleTokenName } from '@lib/typographyModel';
import { tokensForField } from '@lib/tokensForField';
import { ColorInput } from '../controls/ColorInput';
import { previewStyle } from '../controls/livePreview';
import { FontPicker } from '../controls/FontPicker';
import { PresetMenu } from '../controls/PresetMenu';
import { SegmentedControl } from '../controls/SegmentedControl';
import { TokenOrNumberInput } from '../controls/TokenOrNumberInput';
import { WeightSelect } from '../controls/WeightSelect';
import { Section, Row } from './Section';
const ICON_SIZE = 14;
const TEXT_ALIGN_OPTIONS = [
    { value: 'left', label: _jsx(IconAlignLeft, { size: ICON_SIZE }), ariaLabel: 'Align left' },
    { value: 'center', label: _jsx(IconAlignCenter, { size: ICON_SIZE }), ariaLabel: 'Align center' },
    { value: 'right', label: _jsx(IconAlignRight, { size: ICON_SIZE }), ariaLabel: 'Align right' },
];
/** CSS numeric weights run 1–1000; anything else is rejected before storing. */
const isFontWeight = (n) => Number.isInteger(n) && n >= 1 && n <= 1000;
export const TypographySection = ({ elementId }) => {
    const element = useResolvedElement(elementId);
    const patchElement = useCanvasStore((s) => s.patchElement);
    const styleTextRange = useCanvasStore((s) => s.styleTextRange);
    const textSelection = useCanvasStore((s) => s.textSelection);
    /**
     * The characters selected inside THIS element, if any.
     *
     * With a range selected, colour and weight apply to those words
     * rather than the whole element — which is what makes a span.
     * see docs/plans/inline-spans-plan.md
     */
    const range = textSelection?.elementId === elementId ? textSelection : null;
    /** What the selected characters have in common, and what is mixed. */
    const rangeStyle = range === null || element === undefined
        ? null
        : styleOfRange(runsOf(element), range.start, range.end);
    const { presetColors, themeTokens, onOpenTheme } = useColorPickerContext();
    const allFonts = useFontsStore(selectAllFonts);
    // Each input offers only the tokens that make sense for it — see
    // `tokensForField` for the category filtering + prefix prioritization.
    const fontSizeTokens = useMemo(() => tokensForField('fontSize', themeTokens), [themeTokens]);
    const lineHeightTokens = useMemo(() => tokensForField('lineHeight', themeTokens), [themeTokens]);
    const fontFamilyTokens = useMemo(() => tokensForField('fontFamily', themeTokens), [themeTokens]);
    const letterSpacingTokens = useMemo(() => tokensForField('letterSpacing', themeTokens), [themeTokens]);
    const textStyles = useMemo(() => buildTextStyles(themeTokens), [themeTokens]);
    // Hide the eye when none of the typed typography fields are set
    // (and the group isn't already off — leave it visible so the
    // user can toggle back on).
    const hasTypographyContent = element !== undefined &&
        element.type === 'text' &&
        (element.fontFamily !== undefined ||
            element.fontSize !== undefined ||
            element.fontWeight !== undefined ||
            element.color !== undefined ||
            element.textAlign !== undefined ||
            element.lineHeight !== undefined ||
            element.letterSpacing !== undefined);
    const groupToggle = useGroupToggle(elementId, 'typography', hasTypographyContent);
    if (!element || element.type !== 'text')
        return null;
    // Reflect the applied style back into the dropdown by matching the
    // element's size reference (`var(--text-<name>-size)`).
    const currentStyleName = element.fontSize?.match(/^var\(--text-(.+)-size\)$/)?.[1] ?? '';
    /**
     * Apply a whole text style: link the string props to the style's tokens
     * via `var()`, and set the concrete numeric weight (elements store weight
     * as a number, so it can't hold a var). Only props the style defines are
     * touched. see docs/plans/design-system-plan.md
     */
    const applyTextStyle = (name) => {
        const style = textStyles.find((s) => s.name === name);
        if (!style)
            return;
        const weight = style.weight !== null ? Number(style.weight) : null;
        patchElement(elementId, {
            ...(style.family
                ? { fontFamily: `var(${textStyleTokenName(name, 'family')})` }
                : {}),
            ...(style.size
                ? { fontSize: `var(${textStyleTokenName(name, 'size')})` }
                : {}),
            ...(style.leading
                ? { lineHeight: `var(${textStyleTokenName(name, 'leading')})` }
                : {}),
            ...(style.tracking
                ? { letterSpacing: `var(${textStyleTokenName(name, 'tracking')})` }
                : {}),
            ...(weight !== null && isFontWeight(weight)
                ? { fontWeight: weight }
                : {}),
        });
    };
    // The Text style picker lives in the section header (next to the eye
    // toggle) as an icon menu — it applies a whole preset (family/size/
    // weight/leading/tracking) at once. Only shown when styles are defined.
    const textStyleAccessory = (_jsx(PresetMenu, { icon: _jsx(IconTypography, { size: 14, stroke: 1.75 }), ariaLabel: "Apply text style", testId: "text-style-select", active: currentStyleName !== '', options: textStyles.map((s) => ({ value: s.name, label: s.label })), onSelect: applyTextStyle }));
    return (_jsxs(Section, { title: "Typography", elementId: elementId, groupToggle: groupToggle, groupAccessory: textStyleAccessory, fields: [
            'fontFamily',
            'fontSize',
            'fontWeight',
            'color',
            'textAlign',
            'lineHeight',
            'letterSpacing',
        ], cssProperties: [
            'font-family',
            'font-size',
            'font-weight',
            'color',
            'text-align',
            'line-height',
            'letter-spacing',
        ], children: [_jsx(Row, { label: "", children: _jsx(FontPicker, { value: element.fontFamily ?? '', fonts: allFonts, fontTokens: fontFamilyTokens, onChange: (value) => patchElement(elementId, {
                        fontFamily: value.length > 0 ? value : undefined,
                    }), title: "Font family" }) }), _jsxs(Row, { label: "", children: [_jsx(TokenOrNumberInput, { prefix: "Sz", title: "Font size", value: element.fontSize, tokens: fontSizeTokens, defaultUnit: "px", onChange: (value) => patchElement(elementId, { fontSize: value }), onOpenTheme: onOpenTheme, placeholder: "auto" }), _jsx(WeightSelect
                    // The SELECTION's weight when a range is selected, so the
                    // control shows what it is about to change. Empty for a
                    // mixed range rather than one run's answer.
                    , { 
                        // The SELECTION's weight when a range is selected, so the
                        // control shows what it is about to change. Empty for a
                        // mixed range rather than one run's answer.
                        value: rangeStyle?.mixed.includes('fontWeight')
                            ? ''
                            : String(rangeStyle?.shared.fontWeight ?? element.fontWeight ?? 400), onChange: (value) => {
                            const n = Number(value);
                            if (!isFontWeight(n))
                                return;
                            if (range !== null)
                                styleTextRange(elementId, range.start, range.end, { fontWeight: n });
                            else
                                patchElement(elementId, { fontWeight: n });
                        }, title: "Font weight" })] }), _jsxs(Row, { label: "", children: [_jsx(ColorInput
                    // A selection's own colour when the range agrees on one.
                    // `mixed` deliberately shows nothing rather than one run's
                    // answer: red for a red-and-blue selection is a lie the user
                    // then acts on.
                    , { 
                        // A selection's own colour when the range agrees on one.
                        // `mixed` deliberately shows nothing rather than one run's
                        // answer: red for a red-and-blue selection is a lie the user
                        // then acts on.
                        value: rangeStyle?.mixed.includes('color')
                            ? ''
                            : (rangeStyle?.shared.color ?? element.color ?? '#000000'), onChange: (value) => {
                            if (range !== null)
                                styleTextRange(elementId, range.start, range.end, { color: value });
                            else
                                patchElement(elementId, { color: value });
                        }, onPreview: previewStyle(elementId, 'color'), historyElementId: elementId, historyPropertyKey: "color", presetColors: presetColors, tokens: themeTokens, onOpenTheme: onOpenTheme }), _jsx(SegmentedControl, { value: element.textAlign ?? 'left', options: TEXT_ALIGN_OPTIONS, onChange: (value) => patchElement(elementId, { textAlign: value }), title: "Text align" })] }), _jsxs(Row, { label: "", children: [_jsx(TokenOrNumberInput, { prefix: "LH", title: "Line height", value: element.lineHeight, tokens: lineHeightTokens, defaultUnit: "", onChange: (value) => patchElement(elementId, { lineHeight: value }), onOpenTheme: onOpenTheme, placeholder: "auto" }), _jsx(TokenOrNumberInput, { prefix: "LS", title: "Letter spacing", value: element.letterSpacing, tokens: letterSpacingTokens, defaultUnit: "px", onChange: (value) => patchElement(elementId, { letterSpacing: value }), onOpenTheme: onOpenTheme, placeholder: "0" })] })] }));
};
