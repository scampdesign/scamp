import { useCanvasStore } from '@store/canvasSlice';
import { ROOT_ELEMENT_ID } from '@lib/element';

/**
 * Timings for the canvas, called from the e2e speed measurements through
 * `globalThis.__scampIframeCanvas`. see docs/notes/iframe-canvas.md
 */

const nextPaint = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export type Spread = { p50: number; p95: number; max: number };

const spread = (values: number[]): Spread => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return { p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] ?? 0 };
};

const heapMb = (): number | null => {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return memory === undefined ? null : Math.round(memory.usedJSHeapSize / 1e5) / 10;
};

/** Time from a background change in the store to the next paint, `count` times. */
export const benchEdits = async (count: number): Promise<{ elementCount: number; editToPaint: Spread }> => {
  const state = useCanvasStore.getState();
  // A rectangle where there is one; a component starter may only have text.
  const others = Object.values(state.elements).filter((el) => el.id !== ROOT_ELEMENT_ID);
  const target = others.find((el) => el.type === 'rectangle') ?? others[0];
  if (target === undefined) throw new Error('no rectangle to edit');
  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = performance.now();
    useCanvasStore.getState().patchElement(target.id, { backgroundColor: i % 2 === 0 ? '#ff0066' : '#0066ff' });
    await nextPaint();
    times.push(performance.now() - start);
  }
  return { elementCount: Object.keys(state.elements).length, editToPaint: spread(times) };
};

/** Frame-to-frame times while `step` moves the surface, for `frames` frames. */
const frameTimes = (frames: number, step: (i: number) => void): Promise<Spread> =>
  new Promise((resolve) => {
    const deltas: number[] = [];
    let last = performance.now();
    let i = 0;
    const tick = (now: number): void => {
      if (i > 0) deltas.push(now - last);
      last = now;
      if (i === frames) {
        resolve(spread(deltas));
        return;
      }
      step(i);
      i++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

/**
 * `count` read-only copies of the iframe canvas's current document, under one
 * `translate() scale()` transform as the workspace would draw them.
 */
export const benchFrames = async (
  count: number,
  keep = false
): Promise<{ count: number; loadMs: number; heapBeforeMb: number | null; heapAfterMb: number | null; panAt025: Spread; panAt02AllOnScreen: Spread }> => {
  const live = document.querySelector<HTMLIFrameElement>('[data-testid="iframe-canvas"] iframe');
  const html = live?.contentDocument?.documentElement.outerHTML;
  if (html === undefined) throw new Error('turn the iframe canvas on first');
  const width = 1440;
  const height = Math.min(live?.contentDocument?.documentElement.scrollHeight ?? 900, 3000);

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;overflow:hidden;z-index:99999;background:#1a1a1a;';
  const surface = document.createElement('div');
  surface.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;';
  host.appendChild(surface);
  document.body.appendChild(host);

  const heapBeforeMb = heapMb();
  const start = performance.now();
  const columns = 6;
  const loads: Array<Promise<void>> = [];
  for (let i = 0; i < count; i++) {
    const frame = document.createElement('iframe');
    frame.style.cssText =
      `position:absolute;border:0;background:#fff;width:${width}px;height:${height}px;` +
      `left:${(i % columns) * (width + 200)}px;top:${Math.floor(i / columns) * (height + 200)}px;`;
    loads.push(new Promise((resolve) => frame.addEventListener('load', () => resolve(), { once: true })));
    frame.srcdoc = `<!doctype html>${html}`;
    surface.appendChild(frame);
  }
  await Promise.all(loads);
  await nextPaint();
  const loadMs = performance.now() - start;
  const heapAfterMb = heapMb();

  const panAt025 = await frameTimes(120, (i) => {
    surface.style.transform = `translate(${-i * 20}px, ${-i * 8}px) scale(0.25)`;
  });
  const panAt02AllOnScreen = await frameTimes(120, (i) => {
    surface.style.transform = `translate(${(i % 20) - 10}px, 0px) scale(0.2)`;
  });

  // Left mounted when asked, so the caller can read the process's memory with the frames in it.
  if (keep) host.dataset['benchFrames'] = '';
  else host.remove();
  return { count, loadMs, heapBeforeMb, heapAfterMb, panAt025, panAt02AllOnScreen };
};

export const removeFrames = (): void => {
  document.querySelector('[data-bench-frames]')?.remove();
};
