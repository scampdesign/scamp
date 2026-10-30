import { create } from 'zustand';
import { benchEdits, benchFrames, removeFrames } from './bench';
const KEY = 'scamp.iframeCanvas';
const read = () => {
    try {
        return globalThis.localStorage?.getItem(KEY) === '1';
    }
    catch {
        return false;
    }
};
export const useIframeCanvasFlag = create((set) => ({
    on: read(),
    set: (on) => {
        try {
            globalThis.localStorage?.setItem(KEY, on ? '1' : '0');
        }
        catch {
            // The flag still holds for this session.
        }
        set({ on });
    },
}));
export const iframeCanvasStats = { firstDrawMs: null, updates: [] };
globalThis.__scampIframeCanvas = {
    set: (on) => useIframeCanvasFlag.getState().set(on),
    stats: iframeCanvasStats,
    benchEdits,
    benchFrames,
    removeFrames,
};
