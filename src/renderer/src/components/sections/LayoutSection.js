import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { IconArrowDown, IconArrowRight, IconArrowsLeftRight, IconLayoutBoard, IconLayoutGrid, IconTextWrap, IconTextWrapDisabled, } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { useResolvedElement } from '@store/useResolvedElement';
import { AlignmentGrid } from '../controls/AlignmentGrid';
import { EnumSelect } from '../controls/EnumSelect';
import { GapIcon } from '../controls/GapIcon';
import { GridTemplateEditor } from '../controls/GridTemplateEditor';
import { SegmentedControl } from '../controls/SegmentedControl';
import { SpaceValueInput } from '../controls/SpaceValueInput';
import { TableColumnsEditor } from '../controls/TableColumnsEditor';
import { baseDirection, isColumnDirection, isReverseDirection, withReverse, } from '@lib/flexAxis';
import { axisGapPatch, effectiveAxisGaps, hasAxisGaps } from '@lib/flexGap';
import { tokensForField } from '@lib/tokensForField';
import { Section, Row } from './Section';
import styles from './LayoutSection.module.css';
const ICON_SIZE = 16;
const LAYOUT_OPTIONS = [
    {
        value: 'block',
        label: _jsx(IconLayoutBoard, { size: ICON_SIZE, stroke: 1.75 }),
        ariaLabel: 'Block',
        tooltip: 'Block (no flex / no grid)',
    },
    {
        value: 'flex-row',
        label: _jsx(IconArrowRight, { size: ICON_SIZE, stroke: 1.75 }),
        ariaLabel: 'Flex row',
        tooltip: 'Flex row — children flow horizontally',
    },
    {
        value: 'flex-column',
        label: _jsx(IconArrowDown, { size: ICON_SIZE, stroke: 1.75 }),
        ariaLabel: 'Flex column',
        tooltip: 'Flex column — children flow vertically',
    },
    {
        value: 'grid',
        label: _jsx(IconLayoutGrid, { size: ICON_SIZE, stroke: 1.75 }),
        ariaLabel: 'Grid',
        tooltip: 'Grid — 2D layout',
    },
];
const WRAP_OPTIONS = [
    {
        value: 'nowrap',
        label: _jsx(IconTextWrapDisabled, { size: ICON_SIZE, stroke: 1.75 }),
        ariaLabel: 'No wrap',
        tooltip: 'No wrap — children stay on one line and shrink to fit',
    },
    {
        value: 'wrap',
        label: _jsx(IconTextWrap, { size: ICON_SIZE, stroke: 1.75 }),
        ariaLabel: 'Wrap',
        tooltip: 'Wrap — children that don’t fit start a new line',
    },
    {
        value: 'wrap-reverse',
        label: (_jsx(IconTextWrap, { size: ICON_SIZE, stroke: 1.75, className: styles.flipY })),
        ariaLabel: 'Wrap reverse',
        tooltip: 'Wrap reverse — new lines stack in the opposite direction',
    },
];
const ALIGN_OPTIONS = [
    { value: 'flex-start', label: 'Start' },
    { value: 'center', label: 'Center' },
    { value: 'flex-end', label: 'End' },
    { value: 'stretch', label: 'Stretch' },
    { value: 'baseline', label: 'Baseline' },
];
const JUSTIFY_OPTIONS = [
    { value: 'flex-start', label: 'Start' },
    { value: 'center', label: 'Center' },
    { value: 'flex-end', label: 'End' },
    { value: 'space-between', label: 'Between' },
    { value: 'space-around', label: 'Around' },
    { value: 'space-evenly', label: 'Evenly' },
];
const ALIGN_CONTENT_OPTIONS = [
    { value: 'normal', label: 'Normal' },
    { value: 'flex-start', label: 'Start' },
    { value: 'center', label: 'Center' },
    { value: 'flex-end', label: 'End' },
    { value: 'space-between', label: 'Between' },
    { value: 'space-around', label: 'Around' },
    { value: 'space-evenly', label: 'Evenly' },
    { value: 'stretch', label: 'Stretch' },
];
const GRID_SELF_OPTIONS = [
    { value: 'start', label: 'Start' },
    { value: 'center', label: 'Center' },
    { value: 'end', label: 'End' },
    { value: 'stretch', label: 'Stretch' },
];
const layoutModeFor = (el) => {
    if (el.display === 'grid')
        return 'grid';
    if (el.display === 'flex') {
        return isColumnDirection(el.flexDirection) ? 'flex-column' : 'flex-row';
    }
    return 'block';
};
/**
 * Build a patch that switches the element's layout mode and migrates
 * gap fields so the user's intuition about gap-vs-row/column-gap is
 * preserved.
 *
 * - * → flex-(row|column): set display=flex, set flexDirection, keeping
 *   any reverse modifier the element already had. If the previous mode
 *   was grid, copy `columnGap` (preferring the more common axis) into
 *   `gap` and reset both grid gaps.
 * - * → grid: set display=grid. If the previous mode was a flex one,
 *   copy `gap` into both `columnGap` and `rowGap` and reset `gap`.
 * - * → block: set display='none'.
 */
const computeLayoutPatch = (current, next) => {
    const wasGrid = current.display === 'grid';
    const wasFlex = current.display === 'flex';
    if (next === 'block') {
        return { display: 'none' };
    }
    if (next === 'grid') {
        if (wasFlex) {
            return {
                display: 'grid',
                columnGap: current.gap,
                rowGap: current.gap,
                gap: 0,
            };
        }
        return { display: 'grid' };
    }
    // Flex row / flex column.
    const reverse = wasFlex && isReverseDirection(current.flexDirection);
    const flexDirection = withReverse(next === 'flex-column' ? 'column' : 'row', reverse);
    if (wasGrid) {
        return {
            display: 'flex',
            flexDirection,
            gap: current.columnGap || current.rowGap,
            columnGap: 0,
            rowGap: 0,
        };
    }
    return { display: 'flex', flexDirection };
};
export const LayoutSection = ({ elementId }) => {
    const element = useResolvedElement(elementId);
    const patchElement = useCanvasStore((s) => s.patchElement);
    const elements = useCanvasStore((s) => s.elements);
    const themeTokens = useCanvasStore((s) => s.themeTokens);
    const openThemePanel = useCanvasStore((s) => s.openThemePanel);
    // Gap is a spacing property → float `--space-*` tokens to the top.
    const spacingTokens = useMemo(() => tokensForField('spacing', themeTokens), [themeTokens]);
    if (!element)
        return null;
    const isFlex = element.display === 'flex';
    const isGrid = element.display === 'grid';
    const mode = layoutModeFor(element);
    const reversed = isFlex && isReverseDirection(element.flexDirection);
    const wrapping = isFlex && element.flexWrap !== 'nowrap';
    // The axis pair replaces the single Gap once it means something: when
    // wrapping, or when the file already carries a per-axis value.
    const showAxisGaps = isFlex && (wrapping || hasAxisGaps(element));
    const axisGaps = effectiveAxisGaps(element);
    const themeProps = openThemePanel ? { onOpenTheme: openThemePanel } : {};
    // When the element is hidden with `display: none`, layout controls
    // are meaningless — surface that clearly rather than showing
    // interactive controls that won't affect the output CSS.
    if (element.visibilityMode === 'none') {
        return (_jsx(Section, { title: "Layout", children: _jsx("div", { style: {
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    padding: '8px 0',
                    lineHeight: 1.4,
                }, children: "Layout is disabled while Visibility is set to None \u2014 the element is removed from the page." }) }));
    }
    // A table's layout is not one of the modes: it is a grid, always, and
    // its rows are `<tr>` elements rather than track-list entries. So it
    // gets the Columns control on its own and none of the mode picker.
    // see docs/plans/tables-plan.md
    if (element.tag === 'table') {
        return (_jsx(Section, { title: "Columns", elementId: elementId, fields: ['display', 'gridTemplateColumns'], cssProperties: ['display', 'grid-template-columns'], children: _jsx(Row, { label: "", children: _jsx(TableColumnsEditor, { table: element, elements: elements, onChange: (patch) => patchElement(elementId, patch) }) }) }));
    }
    const handleToggleReverse = () => {
        patchElement(elementId, {
            flexDirection: withReverse(baseDirection(element.flexDirection), !reversed),
        });
    };
    return (_jsxs(Section, { title: "Layout", elementId: elementId, fields: [
            'display',
            'flexDirection',
            'flexWrap',
            'alignItems',
            'justifyContent',
            'alignContent',
            'gap',
            'gridTemplateColumns',
            'gridTemplateRows',
            'columnGap',
            'rowGap',
            'justifyItems',
        ], cssProperties: [
            'display',
            'flex-direction',
            'flex-wrap',
            'align-items',
            'justify-content',
            'align-content',
            'gap',
            'grid-template-columns',
            'grid-template-rows',
            'column-gap',
            'row-gap',
            'justify-items',
        ], children: [_jsx(Row, { label: "", children: _jsx(SegmentedControl, { value: mode, options: LAYOUT_OPTIONS, onChange: (value) => patchElement(elementId, computeLayoutPatch(element, value)), title: "Display mode" }) }), isFlex && (_jsxs(_Fragment, { children: [_jsxs(Row, { label: "", children: [_jsx(AlignmentGrid, { direction: element.flexDirection, alignItems: element.alignItems, justifyContent: element.justifyContent, onChange: (patch) => patchElement(elementId, patch) }), _jsxs("div", { style: {
                                    display: 'grid',
                                    gap: 6,
                                    alignContent: 'center',
                                    minWidth: 0,
                                }, children: [_jsx(EnumSelect, { value: element.alignItems, options: ALIGN_OPTIONS, onChange: (value) => patchElement(elementId, { alignItems: value }), title: "Align items" }), _jsx(EnumSelect, { value: element.justifyContent, options: JUSTIFY_OPTIONS, onChange: (value) => patchElement(elementId, { justifyContent: value }), title: "Justify content" }), showAxisGaps ? (_jsxs(_Fragment, { children: [_jsx(SpaceValueInput, { prefix: _jsx(GapIcon, { orientation: "vertical" }), label: "Row gap", title: "Row gap \u2014 between wrapped lines (row-gap)", value: axisGaps.rowGap, onChange: (value) => patchElement(elementId, axisGapPatch(element, 'rowGap', value)), min: 0, tokens: spacingTokens, ...themeProps }), _jsx(SpaceValueInput, { prefix: _jsx(GapIcon, { orientation: "horizontal" }), label: "Column gap", title: "Column gap \u2014 between children on a line (column-gap)", value: axisGaps.columnGap, onChange: (value) => patchElement(elementId, axisGapPatch(element, 'columnGap', value)), min: 0, tokens: spacingTokens, ...themeProps })] })) : (_jsx(SpaceValueInput, { prefix: _jsx(GapIcon, { orientation: isColumnDirection(element.flexDirection)
                                                ? 'vertical'
                                                : 'horizontal' }), label: "Gap", title: "Gap between flex children", value: element.gap, onChange: (value) => patchElement(elementId, { gap: value }), min: 0, tokens: spacingTokens, ...themeProps }))] })] }), _jsxs(Row, { label: "", children: [_jsx(SegmentedControl, { value: element.flexWrap, options: WRAP_OPTIONS, onChange: (value) => patchElement(elementId, { flexWrap: value }), title: "Wrap" }), wrapping && (_jsx(EnumSelect, { value: element.alignContent, options: ALIGN_CONTENT_OPTIONS, onChange: (value) => patchElement(elementId, { alignContent: value }), title: "Align content \u2014 how wrapped lines pack" }))] }), _jsx(Row, { label: "", children: _jsxs("button", { type: "button", className: `${styles.reverseButton} ${reversed ? styles.reverseButtonActive : ''}`, onClick: handleToggleReverse, "aria-pressed": reversed, "aria-label": "Reverse direction", title: reversed
                                ? 'Reversed — children run from the end. Click to restore.'
                                : 'Reverse — run children from the end (row-reverse / column-reverse)', children: [_jsx(IconArrowsLeftRight, { size: 13, stroke: 1.75 }), reversed ? 'Reversed' : 'Reverse'] }) })] })), isGrid && (_jsxs(_Fragment, { children: [_jsx(Row, { label: "", children: _jsx(GridTemplateEditor, { columns: element.gridTemplateColumns, rows: element.gridTemplateRows, onChange: (patch) => patchElement(elementId, patch) }) }), _jsxs(Row, { label: "", children: [_jsx(SpaceValueInput, { prefix: _jsx(GapIcon, { orientation: "horizontal" }), label: "Column gap", title: "column-gap", value: element.columnGap, onChange: (value) => patchElement(elementId, { columnGap: value }), min: 0, tokens: spacingTokens, ...themeProps }), _jsx(SpaceValueInput, { prefix: _jsx(GapIcon, { orientation: "vertical" }), label: "Row gap", title: "row-gap", value: element.rowGap, onChange: (value) => patchElement(elementId, { rowGap: value }), min: 0, tokens: spacingTokens, ...themeProps })] }), _jsxs(Row, { label: "", children: [_jsx(EnumSelect, { value: element.alignItems, options: ALIGN_OPTIONS, onChange: (value) => patchElement(elementId, { alignItems: value }), title: "Align items" }), _jsx(EnumSelect, { value: element.justifyItems, options: GRID_SELF_OPTIONS, onChange: (value) => patchElement(elementId, { justifyItems: value }), title: "Justify items" })] })] }))] }));
};
