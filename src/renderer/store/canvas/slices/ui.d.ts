import type { StateCreator } from 'zustand';
import { type CanvasState } from '../../canvasSlice';
export declare const createUiSlice: StateCreator<CanvasState, [
], [
], Pick<CanvasState, 'bottomPanel' | 'panelMode' | 'sidebarSection' | 'userZoom' | 'fitScale' | 'ratioLocks' | 'imageImportBusy' | 'setImageImportBusy' | 'canvasNotice' | 'showCanvasNotice' | 'collapsedIds' | 'toggleCollapsed' | 'setCollapsed' | 'clearCollapsed' | 'exportSettings' | 'canvasMinHeight' | 'setBottomPanel' | 'routeSource' | 'setRouteSource' | 'toggleBottomPanel' | 'setPanelMode' | 'setSidebarSection' | 'setExportFormat' | 'setExportPngScale' | 'setCanvasMinHeight' | 'zoomIn' | 'zoomOut' | 'resetZoom' | 'setZoom' | 'setFitScale' | 'toggleRatioLock' | 'clearRatioLock' | 'pendingSvgReload' | 'setPendingSvgReload' | 'openThemePanel' | 'setOpenThemePanel'>>;
