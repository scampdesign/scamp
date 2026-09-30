// store/canvas/slices/selection.ts — domain slice split from canvasSlice.ts (5.1).
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

export const createSelectionSlice: StateCreator<
  CanvasState,
  [],
  [],
  Pick<
  CanvasState,
  | 'selectedElementIds'
  | 'editingElementId'
  | 'editingInstanceProp'
  | 'textSelection'
  | 'setTextSelection'
  | 'activeTool'
  | 'setTool'
  | 'selectElement'
  | 'toggleSelectElement'
  | 'setEditingElement'
  | 'setEditingInstanceProp'
>
> = (set) => ({
  selectedElementIds: [],
  editingElementId: null,
  editingInstanceProp: null,
  /**
   * The characters selected inside a text element, as offsets over its
   * joined text — what `applyStyleToRange` and `styleOfRange` take.
   *
   * Transient UI state, beside `editingElementId` for the same reason:
   * it lives for as long as the caret does and never reaches a file.
   * see docs/plans/inline-spans-plan.md
   */
  textSelection: null,
  activeTool: 'select',
  setTool: (tool) => set({ activeTool: tool }),

  selectElement: (id) =>
    set((state) => ({
      selectedElementIds: id === null ? [] : [id],
      // Selecting something else drops the range. Without this a stale
      // selection styles words the user is no longer looking at, the
      // next time they touch a control.
      textSelection: id === state.textSelection?.elementId ? state.textSelection : null,
    })),

  toggleSelectElement: (id) =>
    set((state) => {
      const idx = state.selectedElementIds.indexOf(id);
      if (idx >= 0) {
        const next = [...state.selectedElementIds];
        next.splice(idx, 1);
        return { selectedElementIds: next };
      }
      return { selectedElementIds: [...state.selectedElementIds, id] };
    }),

  setEditingElement: (id) =>
    set((state) => ({
      editingElementId: id,
      // LEAVING edit mode keeps the selection, because reaching the
      // properties panel IS leaving edit mode: clicking a control
      // blurs the contentEditable. Clearing here meant selecting a
      // word and clicking Bold emboldened the whole element, since the
      // range was gone before the control fired.
      //
      // Moving to a DIFFERENT element still clears it — offsets into
      // one element's text mean nothing in another's.
      textSelection:
        id === null || id === state.textSelection?.elementId ? state.textSelection : null,
    })),

  setTextSelection: (selection) => set({ textSelection: selection }),

  setEditingInstanceProp: (value) => set({ editingInstanceProp: value }),

});
