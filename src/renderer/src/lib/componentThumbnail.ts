import { canvasInIframe } from '../canvas/canvasDom';
import { captureIsolatedPng } from './exportCapture';

// Sidebar thumbnail capture. see docs/notes/components-thumbnails.md

const inFlight = new Set<string>();

export const COMPONENT_THUMBNAIL_UPDATED_EVENT =
  'scamp:component-thumbnail-updated';

export type ComponentThumbnailUpdatedDetail = {
  componentName: string;
};

// A component with variants is drawn as its set; the thumbnail is its
// default frame, not the whole set, which also costs seconds to clone.
const findCanvasFrame = (): HTMLElement | null => {
  // shortcut: the iframe experiment's frames can't be rasterised yet; skip rather than save a blank one.
  if (canvasInIframe()) return null;
  const node =
    document.querySelector('[data-variant-cell=""] [data-variant-frame]') ??
    document.querySelector('[data-testid="canvas-frame"]');
  return node instanceof HTMLElement ? node : null;
};

export type CaptureThumbnailInputs = {
  projectPath: string;
  componentName: string;
};

/** Fire-and-forget; never blocks the underlying save. */
export const captureAndPersistComponentThumbnail = (
  inputs: CaptureThumbnailInputs
): void => {
  const key = `${inputs.projectPath}::${inputs.componentName}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);

  void (async () => {
    try {
      const frame = findCanvasFrame();
      if (!frame) return;
      // Isolated, not `capturePng`: that one blanks the live frame's
      // transform and strips selection classes for the duration, which
      // the user sees as the canvas jumping to 100% and back on every
      // component save. `captureIsolatedPng` clones the frame off-screen
      // and touches nothing live. Returns null for a zero-sized frame,
      // which is normal mid-teardown.
      // see docs/notes/project-thumbnails.md
      const dataUrl = await captureIsolatedPng({
        node: frame,
        backgroundColor: null,
      });
      if (dataUrl === null) return;
      const result = await window.scamp.writeComponentThumbnail({
        projectPath: inputs.projectPath,
        componentName: inputs.componentName,
        dataUrl,
      });
      if (!result.ok) {
        console.warn(
          '[componentThumbnail] write failed for',
          inputs.componentName,
          result.error
        );
        return;
      }
      window.dispatchEvent(
        new CustomEvent<ComponentThumbnailUpdatedDetail>(
          COMPONENT_THUMBNAIL_UPDATED_EVENT,
          { detail: { componentName: inputs.componentName } }
        )
      );
    } catch (err) {
      console.warn(
        '[componentThumbnail] capture failed for',
        inputs.componentName,
        err
      );
    } finally {
      inFlight.delete(key);
    }
  })();
};
