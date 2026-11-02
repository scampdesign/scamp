import { create } from 'zustand';

import { BOTTOM_DEFAULT, SIDEBAR_DEFAULT, parseStoredSize } from '@lib/panelSizes';

/**
 * The sizes of the left panel and the bottom panel. App chrome, not part of
 * a project, so they live in this machine's storage and apply to every
 * project. see docs/plans/resizable-sidebar-plan.md
 */
export type PanelSizesState = {
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  bottomPanelHeight: number;
  /** Changes the width on screen; `save` writes it once a drag ends. */
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setBottomPanelHeight: (height: number) => void;
  save: () => void;
};

const KEYS = {
  sidebarWidth: 'scamp.sidebarWidth',
  sidebarCollapsed: 'scamp.sidebarCollapsed',
  bottomPanelHeight: 'scamp.bottomPanelHeight',
} as const;

// Storage can be unavailable, and a missing size just means the default.
const read = (key: string): string | null => {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const write = (key: string, value: string): void => {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Not saved; the size still holds for this session.
  }
};

export const usePanelSizesStore = create<PanelSizesState>((set, get) => ({
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
