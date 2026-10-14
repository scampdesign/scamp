import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useCanvasStore } from '@store/canvasSlice';
import { leadFor, SECTION_FITS } from '@lib/multiEdit';
import { SizeSection } from './sections/SizeSection';
import { LayoutSection } from './sections/LayoutSection';
import { DisplaySection } from './sections/DisplaySection';
import { SpacingSection } from './sections/SpacingSection';
import { BackgroundSection } from './sections/BackgroundSection';
import { BorderSection } from './sections/BorderSection';
import { TypographySection } from './sections/TypographySection';
import { VisibilitySection } from './sections/VisibilitySection';
import { ExportSection } from './sections/ExportSection';
import styles from './PropertiesPanel.module.css';
const useLead = (fits) => useCanvasStore((s) => leadFor(s.selectedElementIds, s.elements, fits));
/**
 * The typed panel for two or more selected elements: the sections that
 * can edit a set, each reading from the first selected element it fits
 * and writing to all of them. Sections that edit one element's own
 * things (name, tag, image, SVG source, position) and the list sections
 * (shadows, filters, transforms, transitions, animation) show only for
 * a single element. see docs/plans/multi-select-edit-plan.md
 */
export const MultiSelectionPanel = () => {
    const count = useCanvasStore((s) => s.selectedElementIds.length);
    const typography = useLead(SECTION_FITS.typography);
    const size = useLead(SECTION_FITS.size);
    const layout = useLead(SECTION_FITS.layout);
    const display = useLead(SECTION_FITS.display);
    const box = useLead(SECTION_FITS.box);
    return (_jsxs("div", { className: styles.uiPanelBody, children: [_jsxs("p", { className: styles.multiNote, "data-testid": "multi-select-note", children: [count, " elements selected. A change applies to each one it fits."] }), typography !== null && _jsx(TypographySection, { elementId: typography }), size !== null && _jsx(SizeSection, { elementId: size }), layout !== null && _jsx(LayoutSection, { elementId: layout }), display !== null && _jsx(DisplaySection, { elementId: display }), box !== null && _jsx(SpacingSection, { elementId: box }), box !== null && _jsx(BackgroundSection, { elementId: box }), box !== null && _jsx(BorderSection, { elementId: box }), box !== null && _jsx(VisibilitySection, { elementId: box }), _jsx(ExportSection, {})] }));
};
