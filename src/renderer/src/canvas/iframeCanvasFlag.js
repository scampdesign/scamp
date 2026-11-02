import { create } from 'zustand';
import { benchEdits, benchFrames, removeFrames } from './bench';
// A new key, so a choice stored while the iframe was opt-in doesn't carry over.
const LEGACY_KEY = 'scamp.legacyCanvas';
const read = () => {
    try {
        return globalThis.localStorage?.getItem(LEGACY_KEY) !== '1';
    }
    catch {
        return true;
    }
};
export const useIframeCanvasFlag = create((set) => ({
    on: read(),
    set: (on) => {
        try {
            if (on)
                globalThis.localStorage?.removeItem(LEGACY_KEY);
            else
                globalThis.localStorage?.setItem(LEGACY_KEY, '1');
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
