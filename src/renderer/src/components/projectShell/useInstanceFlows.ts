import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';

import type { ProjectConfig, ProjectData } from '@shared/types';
import {
  MAX_COMPONENT_CANVAS_DIM,
  MIN_COMPONENT_CANVAS_DIM,
} from '@shared/types';
import { errorMessage } from '@shared/errorMessage';
import { useCanvasStore } from '@store/canvasSlice';
import { generateComponentFromSubtree } from '@lib/extractComponent';
import {
  filterUsagesWithPropOverride,
  findInstanceUsagesAcrossPages,
  findInstancesWithSlotContent,
  groupUsagesByPage,
} from '@lib/componentUsage';

import {
  CONVERT_TO_COMPONENT_EVENT,
  DETACH_INSTANCE_EVENT,
  REQUEST_REMOVE_SLOT_EVENT,
  type ConvertToComponentEventDetail,
  type DetachInstanceEventDetail,
  type RequestRemoveSlotEventDetail,
} from '../ElementContextMenu';
import {
  REQUEST_LOCK_PROP_EVENT,
  type RequestLockPropEventDetail,
} from '../DataPanel';
import type {
  DeletePropTextRequest,
  DetachRequest,
  LockPropRequest,
  SlotRemovalRequest,
} from './types';

type ProjectChange = (
  next: ProjectData | ((prev: ProjectData) => ProjectData)
) => void;

type Args = {
  project: ProjectData;
  onProjectChange?: ProjectChange;
  projectConfig: ProjectConfig;
  onProjectConfigChange: (next: ProjectConfig) => void;
  openComponent: (name: string, fromPage: string | null) => void;
  activePageName: string | null;
};

export type UseInstanceFlows = {
  // Convert-to-component
  convertElementId: string | null;
  convertingComponent: boolean;
  convertError: string | null;
  handleConvertToComponent: (elementId: string, name: string) => Promise<void>;
  cancelConvert: () => void;
  // Lock prop
  lockPropRequest: LockPropRequest | null;
  handleConfirmLockProp: () => void;
  cancelLockProp: () => void;
  // Delete prop text (request raised from the keyboard handler)
  deletePropTextRequest: DeletePropTextRequest | null;
  setDeletePropTextRequest: Dispatch<
    SetStateAction<DeletePropTextRequest | null>
  >;
  handleConfirmDeletePropText: () => void;
  cancelDeletePropText: () => void;
  // Detach instance
  detachRequest: DetachRequest | null;
  handleConfirmDetach: () => void;
  cancelDetach: () => void;
  // Remove slot (warn when instances on other pages fill it)
  slotRemovalRequest: SlotRemovalRequest | null;
  handleConfirmRemoveSlot: () => void;
  cancelRemoveSlot: () => void;
};

/**
 * Owns the multi-file component-instance flows that ProjectShell drives
 * through confirmation modals: convert-to-component, lock-prop-with-
 * overrides, delete-prop-text-with-overrides, and detach. Each subscribes
 * to its menu/canvas event (except delete-prop-text, which the keyboard
 * handler raises via the exposed setter) and exposes the request state +
 * confirm/cancel handlers the modals bind to.
 * see docs/notes/components-multi-file-ops.md
 */
export const useInstanceFlows = ({
  project,
  onProjectChange,
  projectConfig,
  onProjectConfigChange,
  openComponent,
  activePageName,
}: Args): UseInstanceFlows => {
  // ---- Convert-to-component flow ----

  // Element id queued for the create-component dialog. Set when
  // the user picks "Create component…" from the right-click
  // menu; cleared on cancel or after the new component lands.
  const [convertElementId, setConvertElementId] = useState<string | null>(
    null
  );
  const [convertingComponent, setConvertingComponent] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  // Subscribe to the menu's `scamp:convert-to-component` event.
  // The handler stashes the element id so the dialog renders on
  // the next paint; the actual write happens on the dialog's
  // confirm.
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<ConvertToComponentEventDetail>).detail;
      if (!detail) return;
      setConvertError(null);
      setConvertElementId(detail.elementId);
    };
    window.addEventListener(CONVERT_TO_COMPONENT_EVENT, handler);
    return () =>
      window.removeEventListener(CONVERT_TO_COMPONENT_EVENT, handler);
  }, []);

  const handleConvertToComponent = async (
    elementId: string,
    name: string
  ): Promise<void> => {
    setConvertingComponent(true);
    setConvertError(null);
    // Measure the source element's rendered size NOW, while it's still on the
    // page canvas (replaceSubtreeWithInstance below removes it).
    // offsetWidth/Height are logical (scale-independent) px, so this is the
    // true size even for stretch/percentage sizing — used to seed the new
    // component editor's canvas. see docs/archive/2026-07-17-component-canvas-sizing-plan.md
    // Scope to the canvas frame — the layers-panel rows also carry
    // `data-element-id`, and a bare document query would match the (tiny)
    // sidebar row instead of the rendered canvas element.
    const sourceNode = document.querySelector(
      `[data-testid="canvas-frame"] [data-element-id="${elementId}"]`
    );
    const measured =
      sourceNode instanceof HTMLElement
        ? { width: sourceNode.offsetWidth, height: sourceNode.offsetHeight }
        : null;
    try {
      const state = useCanvasStore.getState();
      const generated = generateComponentFromSubtree(
        state.elements,
        elementId,
        name,
        state.breakpoints
      );
      if (!generated) {
        throw new Error('Could not extract the selected element.');
      }
      const created = await window.scamp.createComponent({
        projectPath: project.path,
        componentName: name,
        tsxContent: generated.tsx,
        cssContent: generated.css,
      });
      state.replaceSubtreeWithInstance(elementId, name);
      // Functional updater composes with openComponent's follow-on setProject.
      onProjectChange?.((prev) => ({
        ...prev,
        components: [...prev.components, created],
      }));
      // Seed the component editor's canvas to the source element's rendered
      // size so it opens matching the page — even when the root is stretch
      // (the canvas size is separate from the component's own width:100%).
      if (measured && measured.width > 0 && measured.height > 0) {
        const clampDim = (n: number): number =>
          Math.max(
            MIN_COMPONENT_CANVAS_DIM,
            Math.min(MAX_COMPONENT_CANVAS_DIM, Math.round(n))
          );
        onProjectConfigChange({
          ...projectConfig,
          componentCanvas: {
            ...(projectConfig.componentCanvas ?? {}),
            [created.name]: {
              width: clampDim(measured.width),
              height: clampDim(measured.height),
            },
          },
        });
      }
      setConvertElementId(null);
      openComponent(created.name, activePageName);
    } catch (e) {
      setConvertError(errorMessage(e));
    } finally {
      setConvertingComponent(false);
    }
  };

  const cancelConvert = (): void => {
    if (convertingComponent) return;
    setConvertElementId(null);
    setConvertError(null);
  };

  // ---- Lock-prop-with-overrides warning ----
  const [lockPropRequest, setLockPropRequest] =
    useState<LockPropRequest | null>(null);

  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<RequestLockPropEventDetail>).detail;
      if (!detail) return;
      const usages = findInstanceUsagesAcrossPages(
        project.pages,
        detail.componentName
      );
      const overriding = filterUsagesWithPropOverride(usages, detail.propName);
      if (overriding.length === 0) {
        useCanvasStore.getState().togglePropOnText(detail.elementId);
        return;
      }
      setLockPropRequest({
        elementId: detail.elementId,
        propName: detail.propName,
        impactByPage: groupUsagesByPage(overriding),
      });
    };
    window.addEventListener(REQUEST_LOCK_PROP_EVENT, handler);
    return () => window.removeEventListener(REQUEST_LOCK_PROP_EVENT, handler);
  }, [project.pages]);

  const handleConfirmLockProp = (): void => {
    if (!lockPropRequest) return;
    useCanvasStore.getState().togglePropOnText(lockPropRequest.elementId);
    setLockPropRequest(null);
  };

  const cancelLockProp = (): void => setLockPropRequest(null);

  // ---- Delete-prop-text warning when instances override it ----
  // The request is raised from the global keyboard handler via the
  // exposed setter; this hook owns the resulting modal + confirm.
  const [deletePropTextRequest, setDeletePropTextRequest] =
    useState<DeletePropTextRequest | null>(null);

  const handleConfirmDeletePropText = (): void => {
    if (!deletePropTextRequest) return;
    const state = useCanvasStore.getState();
    for (const id of deletePropTextRequest.elementIds) {
      if (id === state.rootElementId) continue;
      useCanvasStore.getState().deleteElement(id);
    }
    setDeletePropTextRequest(null);
  };

  const cancelDeletePropText = (): void => setDeletePropTextRequest(null);

  // ---- Detach-from-component flow ----
  const [detachRequest, setDetachRequest] = useState<DetachRequest | null>(
    null
  );

  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<DetachInstanceEventDetail>).detail;
      if (!detail) return;
      const state = useCanvasStore.getState();
      const el = state.elements[detail.instanceId];
      if (!el || el.type !== 'component-instance') return;
      const componentName = el.componentName ?? '(unnamed)';
      const overrideCount = Object.keys(el.propOverrides ?? {}).length;
      setDetachRequest({
        instanceId: detail.instanceId,
        componentName,
        overrideCount,
      });
    };
    window.addEventListener(DETACH_INSTANCE_EVENT, handler);
    return () => window.removeEventListener(DETACH_INSTANCE_EVENT, handler);
  }, []);

  const handleConfirmDetach = (): void => {
    if (!detachRequest) return;
    useCanvasStore.getState().detachInstance(detachRequest.instanceId);
    setDetachRequest(null);
  };

  const cancelDetach = (): void => setDetachRequest(null);

  // ---- Remove-slot flow ----
  // Removing a slot in the component editor orphans any content instances on
  // other pages placed in it (the content persists on disk but stops
  // rendering). Warn first; proceed straight to removal when nothing's
  // affected. see docs/notes/components-multi-file-ops.md
  const [slotRemovalRequest, setSlotRemovalRequest] =
    useState<SlotRemovalRequest | null>(null);

  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<RequestRemoveSlotEventDetail>).detail;
      if (!detail) return;
      const affected = findInstancesWithSlotContent(
        project.pages,
        detail.componentName,
        detail.slotName
      );
      if (affected.length === 0) {
        useCanvasStore.getState().toggleSlotOnRect(detail.elementId);
        return;
      }
      setSlotRemovalRequest({
        elementId: detail.elementId,
        slotName: detail.slotName,
        componentName: detail.componentName,
        impactByPage: groupUsagesByPage(affected),
      });
    };
    window.addEventListener(REQUEST_REMOVE_SLOT_EVENT, handler);
    return () => window.removeEventListener(REQUEST_REMOVE_SLOT_EVENT, handler);
  }, [project.pages]);

  const handleConfirmRemoveSlot = (): void => {
    if (!slotRemovalRequest) return;
    useCanvasStore.getState().toggleSlotOnRect(slotRemovalRequest.elementId);
    setSlotRemovalRequest(null);
  };

  const cancelRemoveSlot = (): void => setSlotRemovalRequest(null);

  return {
    convertElementId,
    convertingComponent,
    convertError,
    handleConvertToComponent,
    cancelConvert,
    lockPropRequest,
    handleConfirmLockProp,
    cancelLockProp,
    deletePropTextRequest,
    setDeletePropTextRequest,
    handleConfirmDeletePropText,
    cancelDeletePropText,
    detachRequest,
    handleConfirmDetach,
    cancelDetach,
    slotRemovalRequest,
    handleConfirmRemoveSlot,
    cancelRemoveSlot,
  };
};
