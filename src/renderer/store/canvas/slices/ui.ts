// store/canvas/slices/ui.ts — domain slice split from canvasSlice.ts (5.1).
import type { StateCreator } from 'zustand';
import {
  cloneElementSubtree,
  generateElementId,
  groupSiblings,
  reorderElementPure,
  ROOT_ELEMENT_ID,
  ungroupSiblings,
  wrapElement,
  type BreakpointOverride,
  type ElementAnimation,
  type ElementStateName,
  type KeyframesBlock,
  type PropertyGroup,
  type ScampElement,
} from '@lib/element';
import { canonicalizeGroupList } from '@lib/propertyGroups';
import { useHistoryStore, type HistoryCommitInput } from '../../historySlice';
import { PRESETS_BY_NAME, isPresetName } from '@lib/animationPresets';
import { classNameFor } from '@lib/generateCode';
import { resolveElementAtState } from '@lib/stateCascade';
import { DEFAULT_RECT_STYLES, DEFAULT_ROOT_STYLES } from '@lib/defaults';
import { DEFAULT_BODY_FONT_FAMILY } from '@shared/agentMd';
import {
  DEFAULT_BREAKPOINTS,
  type Breakpoint,
  type ProjectFormat,
  type ThemeToken,
} from '@shared/types';
import {
  defaultTextFontFamily,
  makeComponentInstance,
  makeImage,
  makeInput,
  makeRectangle,
  makeRootElement,
  makeText,
  tagForListChildContext,
} from '../factories';
import {
  BASE_ONLY_PATCH_FIELDS,
  applyPatchWithAxisRouting,
} from '../patchRouting';
import { commitElementsToHistory, freshId } from '../history';
import { stepZoom } from '@lib/zoom';
import {
  useCanvasStore,
  type CanvasState,
  type ActivePage,
  type ActiveComponent,
  type ComponentTree,
  type PageSource,
  type Tool,
  type NewRectInput,
  type NewTextInput,
  type NewImageInput,
  type NewInputInput,
  type NewComponentInstanceInput,
} from '../../canvasSlice';

const CANVAS_NOTICE_MS = 4000;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

export const createUiSlice: StateCreator<
  CanvasState,
  [],
  [],
  Pick<
  CanvasState,
  | 'bottomPanel'
  | 'panelMode'
  | 'sidebarSection'
  | 'userZoom'
  | 'fitScale'
  | 'ratioLocks'
  | 'imageImportBusy'
  | 'setImageImportBusy'
  | 'canvasNotice'
  | 'showCanvasNotice'
  | 'collapsedIds'
  | 'toggleCollapsed'
  | 'setCollapsed'
  | 'clearCollapsed'
  | 'exportSettings'
  | 'canvasMinHeight'
  | 'setBottomPanel'
  | 'routeSource'
  | 'setRouteSource'
  | 'toggleBottomPanel'
  | 'setPanelMode'
  | 'setSidebarSection'
  | 'setExportFormat'
  | 'setExportPngScale'
  | 'setCanvasMinHeight'
  | 'zoomIn'
  | 'zoomOut'
  | 'resetZoom'
  | 'setZoom'
  | 'setFitScale'
  | 'toggleRatioLock'
  | 'clearRatioLock'
  | 'pendingSvgReload'
  | 'setPendingSvgReload'
  | 'openThemePanel'
  | 'setOpenThemePanel'
>
> = (set) => ({
  bottomPanel: 'none',
  routeSource: null,
  panelMode: 'ui',
  sidebarSection: 'pages',
  userZoom: null,
  fitScale: 1,
  ratioLocks: {},
  imageImportBusy: false,
  canvasNotice: null,
  collapsedIds: {},
  pendingSvgReload: null,
  exportSettings: { lastFormat: 'png', lastPngScale: 2 },
  // Default matches the page-editor canvas. ProjectShell
  // overrides this when entering the component editor so the
  // canvas reflects the per-component height.
  canvasMinHeight: 900,
  toggleCollapsed: (id) =>
    set((state) => {
      const next = { ...state.collapsedIds };
      if (next[id] === true) delete next[id];
      else next[id] = true;
      return { collapsedIds: next };
    }),

  setCollapsed: (ids, collapsed) =>
    set((state) => {
      const next = { ...state.collapsedIds };
      for (const id of ids) {
        if (collapsed) next[id] = true;
        else delete next[id];
      }
      return { collapsedIds: next };
    }),

  // Called when the canvas swaps target. Element ids are scoped to their
  // own page and are short enough to repeat across pages, so carrying this
  // over would collapse an unrelated element on the new page.
  clearCollapsed: () => set({ collapsedIds: {} }),

  setImageImportBusy: (imageImportBusy) => set({ imageImportBusy }),

  showCanvasNotice: (message) => {
    if (noticeTimer !== null) clearTimeout(noticeTimer);
    set({ canvasNotice: message });
    noticeTimer = setTimeout(() => {
      noticeTimer = null;
      set({ canvasNotice: null });
    }, CANVAS_NOTICE_MS);
  },

  setBottomPanel: (panel) => set({ bottomPanel: panel }),

  setRouteSource: (source) => set({ routeSource: source }),

  // Open the panel, or close it if it's already the open one. Lives in the
  // store because three call sites need it — the canvas toolbar buttons and
  // the Ctrl+` shortcut — and prop-drilling a toggle from ProjectShell down
  // to Toolbar would be three levels.
  toggleBottomPanel: (panel) =>
    set((state) => ({ bottomPanel: state.bottomPanel === panel ? 'none' : panel })),

  setPanelMode: (mode) => set({ panelMode: mode }),

  setSidebarSection: (section) => set({ sidebarSection: section }),

  setExportFormat: (format) =>
    set((state) => ({
      exportSettings: { ...state.exportSettings, lastFormat: format },
    })),

  setExportPngScale: (scale) =>
    set((state) => ({
      exportSettings: { ...state.exportSettings, lastPngScale: scale },
    })),

  setCanvasMinHeight: (value) => set({ canvasMinHeight: value }),
  // Buttons/keys step a fixed 15% from the CURRENT effective scale
  // (explicit zoom, or the auto-fit value when in fit mode) so the first
  // tap from a 60% fit lands on 75% rather than jumping to a ladder rung.
  zoomIn: () =>
    set((state) => ({
      userZoom: stepZoom(state.userZoom ?? state.fitScale, 1),
    })),

  zoomOut: () =>
    set((state) => ({
      userZoom: stepZoom(state.userZoom ?? state.fitScale, -1),
    })),

  resetZoom: () => set({ userZoom: null }),

  setZoom: (zoom) => set({ userZoom: zoom }),

  setFitScale: (scale) => set({ fitScale: scale }),

  setPendingSvgReload: (value) => set({ pendingSvgReload: value }),

  toggleRatioLock: (id, measured) => {
    const state = useCanvasStore.getState();
    const el = state.elements[id];
    if (!el) return;
    // Unlock.
    if (state.ratioLocks[id] !== undefined) {
      set((s) => {
        const next = { ...s.ratioLocks };
        delete next[id];
        return { ratioLocks: next };
      });
      return;
    }
    // Lock. Resolve px dims: a fixed axis uses its stored value; a
    // non-fixed axis snaps to fixed using its measured render size,
    // falling back to the stored fallback value when unmeasured.
    const w = el.widthMode === 'fixed' ? el.widthValue : measured?.width ?? el.widthValue;
    const h = el.heightMode === 'fixed' ? el.heightValue : measured?.height ?? el.heightValue;
    if (w <= 0 || h <= 0) return;
    const needsConvert = el.widthMode !== 'fixed' || el.heightMode !== 'fixed';
    set((s) => {
      const elements = needsConvert
        ? {
            ...s.elements,
            [id]: applyPatchWithAxisRouting(
              el,
              {
                widthMode: 'fixed',
                widthValue: w,
                widthCustom: undefined,
                heightMode: 'fixed',
                heightValue: h,
                heightCustom: undefined,
              },
              s.activeBreakpointId,
              null,
              s.activeVariantKey
            ),
          }
        : s.elements;
      return { elements, ratioLocks: { ...s.ratioLocks, [id]: w / h } };
    });
    // Snapping non-fixed axes to fixed is a real model edit (it changes
    // the emitted CSS), so record it as an undoable size change.
    if (needsConvert) {
      commitElementsToHistory({ kind: 'resize', elementIds: [id] });
    }
  },

  clearRatioLock: (id) =>
    set((s) => {
      if (s.ratioLocks[id] === undefined) return s;
      const next = { ...s.ratioLocks };
      delete next[id];
      return { ratioLocks: next };
    }),

  openThemePanel: null,
  setOpenThemePanel: (fn) => set({ openThemePanel: fn }),

});
