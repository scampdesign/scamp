import { type RefObject } from 'react';
import { viewSlugFor } from '@shared/templates';

import type { ProjectConfig } from '@shared/types';
import { componentCanvasSizeFor } from '@shared/types';
import { resolveClip } from '@shared/projectConfig';
import { useCanvasStore } from '@store/canvasSlice';
import { useSnapshotsStore } from '@store/snapshotsSlice';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { Viewport } from '@renderer/src/canvas/Viewport';

import { CanvasSizeControl } from '../CanvasSizeControl';
import { ThemeSwitcher } from '../ThemeSwitcher';
import { Toolbar } from '../Toolbar';
import { SvgReloadBanner } from './SvgReloadBanner';
import type { ActiveComponent } from './types';
import styles from '../ProjectShell.module.css';

type Props = {
  activeComponent: ActiveComponent | null;
  activePageName: string | null;
  projectConfig: ProjectConfig;
  artboardScrollRef: RefObject<HTMLDivElement>;
  onProjectConfigChange: (next: ProjectConfig) => void;
  onExitComponentEditor: () => void;
};

/**
 * The artboard column: component-editor banner + breadcrumb, the canvas
 * size control, the scrollable Viewport, and the element toolbar. Page
 * mode uses the project-wide canvas width; component mode uses the
 * per-component canvas size and enables drag-handle resize.
 */
export const CanvasArea = ({
  activeComponent,
  activePageName,
  projectConfig,
  artboardScrollRef,
  onProjectConfigChange,
  onExitComponentEditor,
}: Props): JSX.Element => {
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

  const handleRestorePreview = (): void => {
    void useSnapshotsStore.getState().restorePreview();
  };
  const handleExitPreview = (): void => {
    useCanvasStore.getState().exitSnapshotPreview();
  };

  return (
    <div className={styles.artboard}>
      <div
        ref={artboardScrollRef}
        className={styles.artboardScroll}
        style={{ backgroundColor: projectConfig.artboardBackground }}
      >
        <div className={styles.canvasContent}>
          <SvgReloadBanner />
          {snapshotPreview !== null && (
            <div
              className={styles.snapshotPreviewBanner}
              data-testid="snapshot-preview-banner"
            >
              <span>
                Previewing snapshot:{' '}
                <strong>{snapshotPreview.label}</strong>. The canvas is
                read-only — restoring replaces all project files.
              </span>
              <div className={styles.snapshotPreviewActions}>
                <button
                  type="button"
                  className={styles.snapshotPreviewRestore}
                  onClick={handleRestorePreview}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className={styles.snapshotPreviewExit}
                  onClick={handleExitPreview}
                >
                  Exit
                </button>
              </div>
            </div>
          )}
          {activeComponent !== null && activeComponent.kind === 'component' && (
            <div
              className={styles.componentEditorBanner}
              data-testid="component-editor-banner"
            >
              <span>
                Editing component:{' '}
                <strong>{activeComponent.name}</strong>. Changes
                affect all instances.
              </span>
              <button
                type="button"
                className={styles.componentEditorExit}
                onClick={onExitComponentEditor}
              >
                Exit
              </button>
            </div>
          )}
          <div className={styles.canvasHeader} style={{ maxWidth: headerWidth }}>
            {activeComponent !== null && activeComponent.kind === 'component' ? (
              // Breadcrumb: "<return page> > <component>" when
              // entered from a page, otherwise just the
              // component name. Clicking a non-current segment
              // navigates back to it; clicking the current
              // segment selects the root element same as the
              // page badge.
              <div
                className={styles.canvasHeaderBadge}
                role="navigation"
                aria-label="Component editor breadcrumb"
              >
                {(activeComponent.returnTo !== undefined || activeComponent.returnToPage !== null) && (
                  <>
                    <button
                      type="button"
                      className={styles.canvasBreadcrumbLink}
                      onClick={onExitComponentEditor}
                    >
                      {activeComponent.returnTo?.name ?? activeComponent.returnToPage}
                    </button>
                    <span aria-hidden="true">{' › '}</span>
                  </>
                )}
                <button
                  type="button"
                  className={styles.canvasBreadcrumbCurrent}
                  onClick={() =>
                    useCanvasStore
                      .getState()
                      .selectElement(ROOT_ELEMENT_ID)
                  }
                  title="Select component root"
                >
                  {activeComponent.name}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.canvasHeaderBadge}
                onClick={() =>
                  useCanvasStore
                    .getState()
                    .selectElement(ROOT_ELEMENT_ID)
                }
                title="Select page root"
              >
                {activeComponent !== null
                  ? viewSlugFor(activeComponent.name)
                  : activePageName ?? 'Page'}
              </button>
            )}
            <span className={styles.canvasHeaderSpacer} />
            <ThemeSwitcher />
            <CanvasSizeControl
              config={projectConfig}
              onChange={onProjectConfigChange}
              componentName={component !== null ? component.name : undefined}
              componentKind={component !== null ? 'component' : undefined}
            />
          </div>
          <Viewport
            canvasWidth={frameWidth}
            canvasHeight={
              component !== null
                ? componentCanvasSizeFor(projectConfig, component.name, 'component').height
                : pageHeightIsFixed
                  ? projectConfig.canvasHeight
                  : undefined
            }
            heightIsFixed={pageHeightIsFixed}
            clipContent={clipContent}
            scrollContainerRef={artboardScrollRef}
            // Drag-handle resize is enabled only in component
            // mode; the page canvas uses the project-wide
            // `canvasWidth` setting (no resize handle, no
            // explicit height — page canvases grow with
            // content).
            onResize={
              component !== null
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
                : undefined
            }
          />
        </div>
      </div>
      <div className={styles.elementToolbar}>
        <Toolbar />
      </div>
    </div>
  );
};
