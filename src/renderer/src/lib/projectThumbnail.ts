import { viewSlugFor } from '@shared/templates';
import {
  needsBackfill,
  thumbnailFrame,
  type ThumbnailFrame,
} from '@lib/thumbnailCrop';

import { useCanvasStore } from '@store/canvasSlice';

import { captureIsolatedPng } from './exportCapture';

/**
 * Start-screen thumbnail capture. The component-sidebar equivalent one
 * level down is `componentThumbnail.ts`; this differs in two ways.
 *
 * It crops. A component is small and square-ish, so its capture goes to
 * disk as-is. A page is 1200 by several thousand, and a card is a wide
 * rectangle — see `@lib/thumbnailCrop` for what that means.
 *
 * And it only fires for the home page. The card's job is recognition: a
 * project should look like itself on the start screen, not like whichever
 * page you happened to stop on.
 *
 * see docs/notes/project-thumbnails.md
 */

/** The page whose capture represents the whole project. */
export const THUMBNAIL_PAGE_NAME = 'home';

/**
 * The name to capture under for a target that was just saved, or null
 * when this save is not the project's home.
 *
 * A Scamp-framework project has no pages: every page is a view, opened
 * through `activeComponent`, so its edit target is always a
 * `component`. The capture was gated on `kind === 'page'` and so never
 * ran at all — every framework project has had a blank card on the
 * start screen since the format shipped.
 *
 * The name needs translating as well as the kind. A page is `home`; the
 * view that serves `/` is `Home`, and the slug is what the two formats
 * agree on.
 *
 * A reusable component is not a page however it is named, which is why
 * this takes the tree's kind rather than guessing from the name.
 * see docs/notes/project-thumbnails.md
 */
export const thumbnailNameFor = (
  target: { kind: 'page' | 'component'; name: string },
  treeKind: 'view' | 'component' | undefined
): string | null => {
  if (target.kind === 'page') return target.name;
  if (treeKind !== 'view') return null;
  return viewSlugFor(target.name);
};

const inFlight = new Set<string>();

/**
 * Trailing debounce. A save fires on a 200ms debounce while you type, and
 * rasterising the whole page on each one is far more work than a thumbnail
 * is worth — it also competes with the canvas for the main thread, which
 * is felt as jerky zooming and dragging. One capture once the editing
 * stops is all this needs.
 */
const CAPTURE_IDLE_MS = 1500;
const pending = new Map<string, ReturnType<typeof setTimeout>>();

const findCanvasFrame = (): HTMLElement | null => {
  const node = document.querySelector('[data-testid="canvas-frame"]');
  return node instanceof HTMLElement ? node : null;
};

/** The page's own background, for the strip below a short page. */
const backgroundOf = (node: HTMLElement): string => {
  const paint = globalThis.getComputedStyle(node).backgroundColor;
  // `transparent` / `rgba(…, 0)` would leave the backfill see-through,
  // which reads as a broken image on a dark card.
  if (!paint || paint === 'transparent' || paint.endsWith(', 0)')) {
    return '#ffffff';
  }
  return paint;
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Thumbnail image failed to decode'));
    img.src = src;
  });

/** Draw the capture into a card-shaped canvas and return a PNG data URL. */
const cropToCard = async (
  sourceDataUrl: string,
  frame: ThumbnailFrame,
  background: string
): Promise<string | null> => {
  const img = await loadImage(sourceDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = frame.outWidth;
  canvas.height = frame.outHeight;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  if (needsBackfill(frame)) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, frame.outWidth, frame.outHeight);
  }
  ctx.drawImage(
    img,
    frame.sx,
    frame.sy,
    frame.sWidth,
    frame.sHeight,
    frame.dx,
    frame.dy,
    frame.dWidth,
    frame.dHeight
  );
  return canvas.toDataURL('image/png');
};

export type CaptureProjectThumbnailInputs = {
  projectPath: string;
  /** The page that was just saved. Anything but home is ignored. */
  pageName: string;
};

/** Fire-and-forget; never blocks the underlying save. */
export const captureAndPersistProjectThumbnail = (
  inputs: CaptureProjectThumbnailInputs
): void => {
  if (inputs.pageName !== THUMBNAIL_PAGE_NAME) return;
  const existing = pending.get(inputs.projectPath);
  if (existing !== undefined) clearTimeout(existing);
  pending.set(
    inputs.projectPath,
    setTimeout(() => {
      pending.delete(inputs.projectPath);
      runCapture(inputs.projectPath);
    }, CAPTURE_IDLE_MS)
  );
};

/**
 * Run a scheduled capture now, because the project is closing and the
 * timer would otherwise fire against an unmounted canvas.
 *
 * Safe to call immediately before the unmount: the capture clones the
 * frame and detaches the copy synchronously, so the rasterising that
 * follows no longer depends on the canvas still being there. No-op when
 * nothing is scheduled — closing without editing should not rewrite an
 * identical thumbnail.
 */
export const flushPendingProjectThumbnail = (projectPath: string): void => {
  const existing = pending.get(projectPath);
  if (existing === undefined) return;
  clearTimeout(existing);
  pending.delete(projectPath);
  runCapture(projectPath);
};

const runCapture = (projectPath: string): void => {
  // The canvas on screen belongs to whatever project is open NOW, but
  // this capture was scheduled against the project that was open when
  // the save happened. Close one project and open another inside the
  // debounce and the two disagree: the photograph is of the new
  // project and it is filed under the old one, which is how a card
  // ended up wearing another project's screenshot.
  //
  // The close path is unaffected — it flushes while its own project is
  // still the open one, which is the whole reason it runs before the
  // unmount. see docs/notes/project-thumbnails.md
  if (useCanvasStore.getState().projectPath !== projectPath) return;
  if (inFlight.has(projectPath)) return;
  inFlight.add(projectPath);

  void (async () => {
    try {
      const node = findCanvasFrame();
      if (!node) return;
      const frame = thumbnailFrame({
        sourceWidth: node.offsetWidth,
        sourceHeight: node.offsetHeight,
      });
      // Null means the frame had no size — normal mid-teardown.
      if (frame === null) return;

      const background = backgroundOf(node);
      const captured = await captureIsolatedPng({
        node,
        backgroundColor: background,
      });
      if (captured === null) return;
      const cropped = await cropToCard(captured, frame, background);
      if (cropped === null) return;

      const result = await window.scamp.writeProjectThumbnail({
        projectPath,
        dataUrl: cropped,
      });
      if (!result.ok) {
        console.warn('[projectThumbnail] write failed', result.error);
      }
    } catch (err) {
      console.warn('[projectThumbnail] capture failed', err);
    } finally {
      inFlight.delete(projectPath);
    }
  })();
};
