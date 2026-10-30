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
export declare const usePanelSizesStore: import("zustand").UseBoundStore<import("zustand").StoreApi<PanelSizesState>>;
