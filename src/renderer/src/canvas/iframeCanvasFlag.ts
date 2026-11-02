import { create } from 'zustand';

import { benchEdits, benchFrames, removeFrames } from './bench';

/**
 * The canvas draws the page in an iframe (`IframeCanvas`). For one release
 * today's canvas stays reachable as a fallback, from the developer tools:
 * `__scampIframeCanvas.set(false)`, remembered on this machine.
 * see docs/notes/iframe-canvas.md
 */
type IframeCanvasFlag = {
  on: boolean;
  set: (on: boolean) => void;
};

// A new key, so a choice stored while the iframe was opt-in doesn't carry over.
const LEGACY_KEY = 'scamp.legacyCanvas';

const read = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(LEGACY_KEY) !== '1';
  } catch {
    return true;
  }
};

export const useIframeCanvasFlag = create<IframeCanvasFlag>((set) => ({
  on: read(),
  set: (on) => {
    try {
      if (on) globalThis.localStorage?.removeItem(LEGACY_KEY);
      else globalThis.localStorage?.setItem(LEGACY_KEY, '1');
    } catch {
      // The flag still holds for this session.
    }
    set({ on });
  },
}));

/** Timings the iframe canvas reports, read by the e2e speed measurements. */
export type IframeCanvasStats = {
  firstDrawMs: number | null;
  /** Each update: building the HTML and CSS, then patching the DOM. */
  updates: Array<{ buildMs: number; patchMs: number }>;
};

export const iframeCanvasStats: IframeCanvasStats = { firstDrawMs: null, updates: [] };

(globalThis as unknown as { __scampIframeCanvas: unknown }).__scampIframeCanvas = {
  set: (on: boolean): void => useIframeCanvasFlag.getState().set(on),
  stats: iframeCanvasStats,
  benchEdits,
  benchFrames,
  removeFrames,
};
