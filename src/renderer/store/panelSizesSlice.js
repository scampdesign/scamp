import { create } from 'zustand';
import { BOTTOM_DEFAULT, SIDEBAR_DEFAULT, parseStoredSize } from '@lib/panelSizes';
const KEYS = {
    sidebarWidth: 'scamp.sidebarWidth',
    sidebarCollapsed: 'scamp.sidebarCollapsed',
    bottomPanelHeight: 'scamp.bottomPanelHeight',
};
// Storage can be unavailable, and a missing size just means the default.
const read = (key) => {
    try {
        return globalThis.localStorage?.getItem(key) ?? null;
    }
    catch {
        return null;
    }
};
const write = (key, value) => {
    try {
        globalThis.localStorage?.setItem(key, value);
    }
    catch {
        // Not saved; the size still holds for this session.
    }
};
export const usePanelSizesStore = create((set, get) => ({
    sidebarWidth: parseStoredSize(read(KEYS.sidebarWidth), SIDEBAR_DEFAULT),
    sidebarCollapsed: read(KEYS.sidebarCollapsed) === 'true',
    bottomPanelHeight: parseStoredSize(read(KEYS.bottomPanelHeight), BOTTOM_DEFAULT),
    setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
    setSidebarCollapsed: (sidebarCollapsed) => {
        set({ sidebarCollapsed });
        get().save();
    },
    toggleSidebarCollapsed: () => get().setSidebarCollapsed(!get().sidebarCollapsed),
    setBottomPanelHeight: (bottomPanelHeight) => set({ bottomPanelHeight }),
    save: () => {
        const { sidebarWidth, sidebarCollapsed, bottomPanelHeight } = get();
        write(KEYS.sidebarWidth, String(sidebarWidth));
        write(KEYS.sidebarCollapsed, String(sidebarCollapsed));
        write(KEYS.bottomPanelHeight, String(bottomPanelHeight));
    },
}));
