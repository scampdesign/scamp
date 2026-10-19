import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { viewSlugFor } from '@shared/templates';
import { componentCanvasSizeFor } from '@shared/types';
import { resolveClip } from '@shared/projectConfig';
import { useCanvasStore } from '@store/canvasSlice';
import { useSnapshotsStore } from '@store/snapshotsSlice';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { Viewport } from '@renderer/src/canvas/Viewport';
import { VariantFrames } from '@renderer/src/canvas/VariantFrames';
import { CanvasSizeControl } from '../CanvasSizeControl';
import { ThemeSwitcher } from '../ThemeSwitcher';
import { Toolbar } from '../Toolbar';
import { VariantBar } from '../VariantBar';
import { SvgReloadBanner } from './SvgReloadBanner';
import { CanvasNotice } from './CanvasNotice';
import styles from '../ProjectShell.module.css';
/**
 * The artboard column: component-editor banner + breadcrumb, the canvas
 * size control, the scrollable Viewport, and the element toolbar. Page
 * mode uses the project-wide canvas width; component mode uses the
 * per-component canvas size and enables drag-handle resize.
 */
export const CanvasArea = ({ activeComponent, activePageName, projectConfig, artboardScrollRef, onProjectConfigChange, onExitComponentEditor, }) => {
    const snapshotPreview = useCanvasStore((s) => s.snapshotPreview);
    const activeBreakpointId = useCanvasStore((s) => s.activeBreakpointId);
    // A view is a page's design: it gets the page canvas (breakpoint width,
    // clip, no artboard handles). Only a component has its own artboard.
    const component = activeComponent !== null && activeComponent.kind === 'component' ? activeComponent : null;
    const isComponent = component !== null;
    // Clip: component editor has no breakpoints → single legacy flag; page
    // canvas → per-breakpoint map. Fixed height applies to the page canvas
    // only (component canvas already carries an explicit design height).
    const clipContent = isComponent
        ? projectConfig.canvasOverflowHidden
        : resolveClip(projectConfig, activeBreakpointId);
    const pageHeightIsFixed = !isComponent && projectConfig.canvasFixedHeight === true;
    const frameWidth = component !== null
        ? componentCanvasSizeFor(projectConfig, component.name, 'component').width
        : projectConfig.canvasWidth;
    // The header spans the frame as drawn, so the size control sits at the
    // frame's right edge. Fit zooms to the content, overflow included, so a
    // page with a wide marquee draws its frame well short of the canvas area.
    const scale = useCanvasStore((s) => s.userZoom ?? s.fitScale);
    const headerWidth = Math.round(frameWidth * scale);
    const handleRestorePreview = () => {
        void useSnapshotsStore.getState().restorePreview();
    };
    const handleExitPreview = () => {
        useCanvasStore.getState().exitSnapshotPreview();
    };
    return (_jsxs("div", { className: styles.artboard, children: [_jsx("div", { ref: artboardScrollRef, className: styles.artboardScroll, style: { backgroundColor: projectConfig.artboardBackground }, children: _jsxs("div", { className: styles.canvasContent, children: [_jsx(SvgReloadBanner, {}), snapshotPreview !== null && (_jsxs("div", { className: styles.snapshotPreviewBanner, "data-testid": "snapshot-preview-banner", children: [_jsxs("span", { children: ["Previewing snapshot:", ' ', _jsx("strong", { children: snapshotPreview.label }), ". The canvas is read-only \u2014 restoring replaces all project files."] }), _jsxs("div", { className: styles.snapshotPreviewActions, children: [_jsx("button", { type: "button", className: styles.snapshotPreviewRestore, onClick: handleRestorePreview, children: "Restore" }), _jsx("button", { type: "button", className: styles.snapshotPreviewExit, onClick: handleExitPreview, children: "Exit" })] })] })), activeComponent !== null && activeComponent.kind === 'component' && (_jsxs("div", { className: styles.componentEditorBanner, "data-testid": "component-editor-banner", children: [_jsxs("span", { children: ["Editing component:", ' ', _jsx("strong", { children: activeComponent.name }), ". Changes affect all instances."] }), _jsx("button", { type: "button", className: styles.componentEditorExit, onClick: onExitComponentEditor, children: "Exit" })] })), _jsxs("div", { className: styles.canvasHeader, style: { maxWidth: headerWidth }, children: [activeComponent !== null && activeComponent.kind === 'component' ? (
                                // Breadcrumb: "<return page> > <component>" when
                                // entered from a page, otherwise just the
                                // component name. Clicking a non-current segment
                                // navigates back to it; clicking the current
                                // segment selects the root element same as the
                                // page badge.
                                _jsxs("div", { className: styles.canvasHeaderBadge, role: "navigation", "aria-label": "Component editor breadcrumb", children: [(activeComponent.returnTo !== undefined || activeComponent.returnToPage !== null) && (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: styles.canvasBreadcrumbLink, onClick: onExitComponentEditor, children: activeComponent.returnTo?.name ?? activeComponent.returnToPage }), _jsx("span", { "aria-hidden": "true", children: ' › ' })] })), _jsx("button", { type: "button", className: styles.canvasBreadcrumbCurrent, onClick: () => useCanvasStore
                                                .getState()
                                                .selectElement(ROOT_ELEMENT_ID), title: "Select component root", children: activeComponent.name })] })) : (_jsx("button", { type: "button", className: styles.canvasHeaderBadge, onClick: () => useCanvasStore
                                        .getState()
                                        .selectElement(ROOT_ELEMENT_ID), title: "Select page root", children: activeComponent !== null
                                        ? viewSlugFor(activeComponent.name)
                                        : activePageName ?? 'Page' })), _jsx("span", { className: styles.canvasHeaderSpacer }), _jsx(ThemeSwitcher, {}), _jsx(CanvasSizeControl, { config: projectConfig, onChange: onProjectConfigChange, componentName: component !== null ? component.name : undefined, componentKind: component !== null ? 'component' : undefined })] }), component !== null && _jsx(VariantBar, {}), _jsx(Viewport, { canvasWidth: frameWidth, canvasHeight: component !== null
                                ? componentCanvasSizeFor(projectConfig, component.name, 'component').height
                                : pageHeightIsFixed
                                    ? projectConfig.canvasHeight
                                    : undefined, heightIsFixed: pageHeightIsFixed, clipContent: clipContent, scrollContainerRef: artboardScrollRef, 
                            // Drag-handle resize is enabled only in component
                            // mode; the page canvas uses the project-wide
                            // `canvasWidth` setting (no resize handle, no
                            // explicit height — page canvases grow with
                            // content).
                            onResize: component !== null
                                ? (width, height) => {
                                    const name = component.name;
                                    const nextMap = {
                                        ...(projectConfig.componentCanvas ?? {}),
                                        [name]: { width, height },
                                    };
                                    onProjectConfigChange({
                                        ...projectConfig,
                                        componentCanvas: nextMap,
                                    });
                                }
                                : undefined }), component !== null && (_jsx(VariantFrames, { width: frameWidth, minHeight: componentCanvasSizeFor(projectConfig, component.name, 'component').height, scale: scale }))] }) }), _jsx(CanvasNotice, {}), _jsx("div", { className: styles.elementToolbar, children: _jsx(Toolbar, {}) })] }));
};
