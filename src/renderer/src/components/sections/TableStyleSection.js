import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import { IconAlignCenter, IconAlignLeft, IconAlignRight } from '@tabler/icons-react';
import { useCanvasStore } from '@store/canvasSlice';
import { useColorPickerContext } from '@store/hooks/useColorPickerContext';
import { isZeroSpaceTuple, ZERO_SPACE_TUPLE } from '@lib/spaceValue';
import { mergeTableStyle } from '@lib/tableStyle';
import { tokensForField } from '@lib/tokensForField';
import { ColorInput } from '../controls/ColorInput';
import { EnumSelect } from '../controls/EnumSelect';
import { FourSideInput } from '../controls/FourSideInput';
import { NumberInput } from '../controls/NumberInput';
import { SegmentedControl } from '../controls/SegmentedControl';
import { Section, Row } from './Section';
const ICON_SIZE = 14;
// Starting values for the user's table, not app chrome: a light rule
// and a light band that read on a white page until the user picks theirs.
const DEFAULT_DIVIDER = { width: 1, style: 'solid', color: '#e0e0e0' };
const DEFAULT_STRIPE = '#f5f5f5';
const DIVIDER_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
];
const ON_OFF_OPTIONS = [
    { value: 'off', label: 'Off' },
    { value: 'on', label: 'On' },
];
const CELL_ALIGN_OPTIONS = [
    { value: 'auto', label: 'Auto', tooltip: 'Cells follow the table' },
    { value: 'left', label: _jsx(IconAlignLeft, { size: ICON_SIZE }), ariaLabel: 'Align left' },
    { value: 'center', label: _jsx(IconAlignCenter, { size: ICON_SIZE }), ariaLabel: 'Align center' },
    { value: 'right', label: _jsx(IconAlignRight, { size: ICON_SIZE }), ariaLabel: 'Align right' },
];
/**
 * Row and cell styling for a `<table>`, set once for every row and cell.
 *
 * Reads the stored element rather than the resolved one: `tableStyle`
 * has no breakpoint or state overrides, so the stored value is what
 * every breakpoint and state shows.
 * see docs/plans/tables-plan.md
 */
export const TableStyleSection = ({ elementId }) => {
    const element = useCanvasStore((s) => s.elements[elementId]);
    const patchElement = useCanvasStore((s) => s.patchElement);
    const { presetColors, themeTokens, onOpenTheme } = useColorPickerContext();
    const spacingTokens = useMemo(() => tokensForField('spacing', themeTokens), [themeTokens]);
    if (!element || element.tag !== 'table')
        return null;
    const style = element.tableStyle;
    const divider = style?.rowDivider;
    const update = (patch) => {
        patchElement(elementId, { tableStyle: mergeTableStyle(style, patch) });
    };
    const handleDividerStyleChange = (value) => {
        if (value === 'none') {
            update({ rowDivider: undefined });
            return;
        }
        update({ rowDivider: { ...(divider ?? DEFAULT_DIVIDER), style: value } });
    };
    return (_jsxs(Section, { title: "Rows and cells", elementId: elementId, children: [_jsxs(Row, { label: "Dividers", tooltip: "A line under every row, set once for the whole table.", children: [_jsx(EnumSelect, { value: divider?.style ?? 'none', options: DIVIDER_OPTIONS, onChange: handleDividerStyleChange, title: "Row divider style" }), divider !== undefined && (_jsx(NumberInput, { prefix: "W", title: "Row divider width", value: divider.width, min: 1, onChange: (width) => {
                            if (width !== undefined)
                                update({ rowDivider: { ...divider, width } });
                        } }))] }), divider !== undefined && (_jsx(Row, { label: "", children: _jsx(ColorInput, { value: divider.color, onChange: (color) => update({ rowDivider: { ...divider, color } }), presetColors: presetColors, tokens: themeTokens, onOpenTheme: onOpenTheme, ariaLabel: "Row divider color" }) })), _jsx(Row, { label: "Stripes", tooltip: "A background on every second body row.", children: _jsx(SegmentedControl, { value: style?.stripe !== undefined ? 'on' : 'off', options: ON_OFF_OPTIONS, onChange: (value) => update({ stripe: value === 'on' ? DEFAULT_STRIPE : undefined }), title: "Stripe body rows" }) }), style?.stripe !== undefined && (_jsx(Row, { label: "", children: _jsx(ColorInput, { value: style.stripe, onChange: (stripe) => update({ stripe }), presetColors: presetColors, tokens: themeTokens, onOpenTheme: onOpenTheme, ariaLabel: "Stripe color" }) })), _jsx(Row, { label: "Sticky header", tooltip: "The header row stays at the top while the page scrolls. Shown in the preview; the canvas does not scroll.", children: _jsx(SegmentedControl, { value: style?.stickyHeader === true ? 'on' : 'off', options: ON_OFF_OPTIONS, onChange: (value) => update({ stickyHeader: value === 'on' ? true : undefined }), title: "Sticky header" }) }), _jsx(Row, { label: "Cell padding", tooltip: "Padding on every cell. A cell's own padding still wins.", children: _jsx(FourSideInput, { prefix: "P", title: "Cell padding (top right bottom left)", value: style?.cellPadding ?? ZERO_SPACE_TUPLE, onChange: (next) => update({ cellPadding: isZeroSpaceTuple(next) ? undefined : next }), min: 0, tokens: spacingTokens, onOpenTheme: onOpenTheme }) }), _jsx(Row, { label: "Cell align", tooltip: "Text alignment in every cell. A cell's own alignment still wins.", children: _jsx(SegmentedControl, { value: style?.cellAlign ?? 'auto', options: CELL_ALIGN_OPTIONS, onChange: (value) => update({ cellAlign: value === 'auto' ? undefined : value }), title: "Cell text alignment" }) })] }));
};
