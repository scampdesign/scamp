import { create } from 'zustand';

import { benchEdits, benchFrames, removeFrames } from './bench';

/**
 * Experiment only: draw the page canvas as the HTML export inside a
 * same-origin iframe (option C1). see docs/plans/canvas-rendering-options.md
 */
type IframeCanvasFlag = {
  on: boolean;
  set: (on: boolean) => void;
};

const KEY = 'scamp.iframeCanvas';

const read = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

export const useIframeCanvasFlag = create<IframeCanvasFlag>((set) => ({
  on: read(),
  set: (on) => {
    try {
      globalThis.localStorage?.setItem(KEY, on ? '1' : '0');
    } catch {
      // The flag still holds for this session.
    }
    set({ on });
  },
}));

/** Timings the experiment reports, read by the e2e measurements. */
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
