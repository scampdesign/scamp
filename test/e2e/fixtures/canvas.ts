import type { Page } from '@playwright/test';

import { canvasFrame } from './selectors';

/**
 * Helpers for driving real mouse + keyboard against the canvas. The
 * frame element is `transform: scale()`-ed to fit the viewport, so
 * every helper translates frame-local (unscaled) coordinates into the
 * client coordinates Playwright's mouse API expects.
 */

export type FramePoint = { x: number; y: number };

export type FrameMetrics = {
  /** Scaled top-left of the frame in viewport coords. */
  rect: { x: number; y: number; width: number; height: number };
  /** Ratio between visible pixels and logical pixels (== 1 if not auto-fit). */
  scale: number;
};

export const measureFrame = async (page: Page): Promise<FrameMetrics> => {
  const frame = canvasFrame(page);
  await frame.waitFor({ state: 'visible' });
  const box = await frame.boundingBox();
  if (!box) throw new Error('canvas frame has no bounding box');
  const canvasWidth = await frame.evaluate((el) =>
    Number((el as HTMLElement).dataset['canvasWidth'] ?? '0')
  );
  // The element's CSS width is the logical (unscaled) pixel width, so
  // the scale factor is visible-width / logical-width.
  const scale = canvasWidth > 0 ? box.width / canvasWidth : 1;
  return { rect: box, scale };
};

export const frameToClient = (
  metrics: FrameMetrics,
  point: FramePoint
): { x: number; y: number } => ({
  x: metrics.rect.x + point.x * metrics.scale,
  y: metrics.rect.y + point.y * metrics.scale,
});

/**
 * Drag from `start` to `end` in frame-local coordinates. Emits real
 * pointer events via Playwright's mouse API — the canvas interaction
 * layer captures the pointer and the draw/move/resize handlers react.
 *
 * `steps` controls the number of intermediate mouse-move events; more
 * steps make pointer-move handlers see a smooth drag. 10 is enough
 * for every draw/move/resize handler in Scamp today.
 */
export const dragInFrame = async (
  page: Page,
  start: FramePoint,
  end: FramePoint,
  options: { steps?: number } = {}
): Promise<void> => {
  const metrics = await measureFrame(page);
  const from = frameToClient(metrics, start);
  const to = frameToClient(metrics, end);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: options.steps ?? 10 });
  await page.mouse.up();
};

/** Click once at a frame-local coordinate. */
export const clickInFrame = async (
  page: Page,
  point: FramePoint
): Promise<void> => {
  const metrics = await measureFrame(page);
  const client = frameToClient(metrics, point);
  await page.mouse.click(client.x, client.y);
};

/** Activate a drawing tool via keyboard shortcut (r, t, f, v). */
export const selectTool = async (
  page: Page,
  shortcut: 'v' | 'r' | 't' | 'i' | 'f'
): Promise<void> => {
  // The toolbar listens on the app's `window`, and skips inputs and
  // contentEditable, so focus must be on the app's body. A click on the
  // frame's corner did this but timed out when the canvas covered that spot.
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLIFrameElement) {
      (active.contentDocument?.activeElement as HTMLElement | null)?.blur();
    }
    (active as HTMLElement | null)?.blur();
  });
  await page.keyboard.press(shortcut);
};
