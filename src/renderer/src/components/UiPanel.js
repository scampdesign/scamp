import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCanvasStore } from '@store/canvasSlice';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { PositionSection } from './sections/PositionSection';
import { SizeSection } from './sections/SizeSection';
import { LayoutSection } from './sections/LayoutSection';
import { DisplaySection } from './sections/DisplaySection';
import { SpacingSection } from './sections/SpacingSection';
import { TableStyleSection } from './sections/TableStyleSection';
import { BackgroundSection } from './sections/BackgroundSection';
import { BorderSection } from './sections/BorderSection';
import { ElementSection } from './sections/ElementSection';
import { TypographySection } from './sections/TypographySection';
import { ImageSection } from './sections/ImageSection';
import { SvgSection } from './sections/SvgSection';
import { VisibilitySection } from './sections/VisibilitySection';
import { ShadowsSection } from './sections/ShadowsSection';
import { FiltersSection } from './sections/FiltersSection';
import { TransformSection } from './sections/TransformSection';
import { TransitionsSection } from './sections/TransitionsSection';
import { AnimationSection } from './sections/AnimationSection';
import { ExportSection } from './sections/ExportSection';
import { MultiSelectionPanel } from './MultiSelectionPanel';
import { VariantsSection } from './VariantsSection';
import styles from './PropertiesPanel.module.css';
/**
 * The typed view of the properties panel. Reads the primary selected
 * element from the store and renders the sections that apply to its
 * element type. Root is treated like a regular rectangle — it just
 * has no parent, so Position is hidden.
 *
 * Each section is its own small component that reads its own slice of
 * the store and writes via `patchElement`. The UI panel is a thin
 * orchestrator with no edit logic of its own.
 */
export const UiPanel = () => {
    const elementId = useCanvasStore((s) => s.selectedElementIds[0] ?? null);
    const isMulti = useCanvasStore((s) => s.selectedElementIds.length > 1);
    const element = useCanvasStore((s) => (elementId ? s.elements[elementId] : undefined));
    const isComponent = useCanvasStore((s) => s.activeComponent?.kind === 'component');
    const parentIsFlex = useCanvasStore((s) => {
        if (!element || !element.parentId)
            return false;
        const parent = s.elements[element.parentId];
        return parent?.display === 'flex';
    });
    if (!elementId || !element)
        return _jsx(_Fragment, {});
    if (isMulti)
        return _jsx(MultiSelectionPanel, {});
    const isRoot = elementId === ROOT_ELEMENT_ID;
    const isText = element.type === 'text';
    const isImage = element.type === 'image';
    const isInput = element.type === 'input';
    const isSvg = element.tag === 'svg';
    const isInstance = element.type === 'component-instance';
    // Position is only meaningful when there's a non-flex parent to
    // anchor against. Root has no parent; flex children flow with the
    // layout engine.
    const showPosition = !isRoot && !parentIsFlex;
    // A component instance's appearance belongs to the component
    // definition, and the page can't override it — the only thing the
    // page owns is the instance's size. Showing background / border /
    // spacing here would offer edits that silently vanish on the next
    // reload, because the generator has nowhere to write them.
    // see docs/notes/components-data-model.md
    if (isInstance) {
        return (_jsxs("div", { className: styles.uiPanelBody, children: [_jsx(ElementSection, { elementId: elementId }), _jsx(SizeSection, { elementId: elementId }), _jsx(ExportSection, {})] }));
    }
    return (_jsxs("div", { className: styles.uiPanelBody, children: [isRoot && isComponent && _jsx(VariantsSection, {}), !isRoot && _jsx(ElementSection, { elementId: elementId }), isText && _jsx(TypographySection, { elementId: elementId }), isImage && _jsx(ImageSection, { elementId: elementId }), showPosition && _jsx(PositionSection, { elementId: elementId }), _jsx(SizeSection, { elementId: elementId }), !isText && !isInput && _jsx(LayoutSection, { elementId: elementId }), (isText || isInput) && _jsx(DisplaySection, { elementId: elementId }), element.tag === 'table' && _jsx(TableStyleSection, { elementId: elementId }), _jsx(SpacingSection, { elementId: elementId, hideMargin: isRoot }), isSvg && _jsx(SvgSection, { elementId: elementId }), _jsx(BackgroundSection, { elementId: elementId }), _jsx(BorderSection, { elementId: elementId }), _jsx(ShadowsSection, { elementId: elementId }), _jsx(FiltersSection, { elementId: elementId }), _jsx(TransformSection, { elementId: elementId }), _jsx(VisibilitySection, { elementId: elementId }), _jsx(TransitionsSection, { elementId: elementId }), _jsx(AnimationSection, { elementId: elementId }), _jsx(ExportSection, {})] }));
};
