import { type PointerEvent, useState } from 'react';

import { useCanvasStore } from '@store/canvasSlice';
import { useHistoryStore } from '@store/historySlice';
import { clampToParent, MIN_SIZE } from '@lib/bounds';
import { lockedCornerResize, type CornerHandle } from '@lib/aspectRatio';
import { axesForHandle } from '@lib/resizeAxes';
import { resolveElementAtState } from '@lib/stateCascade';

import { isResizeHandle } from './canvasHitTest';
import type { CanvasGeometry, ResizeState } from './types';

export type ResizeInteraction = {
  /** Claim the gesture if a resize handle is under the cursor. */
  tryStart: (e: PointerEvent<HTMLDivElement>) => boolean;
  /** Apply the resize while dragging; returns true if a resize is active. */
  onMove: (e: PointerEvent<HTMLDivElement>) => boolean;
  /** Commit the resize transaction and clear state on pointer release. */
  onEnd: () => void;
};

/**
 * Resize state machine. Handles sit on top of everything and take
 * precedence over the tools, but only when exactly one element is
 * selected. A history transaction wraps the per-tick `resizeElement`
 * calls so the whole drag commits as a single `resize` entry.
 */
export const useResizeInteraction = (
  geometry: CanvasGeometry,
  scale: number
): ResizeInteraction => {
  const [resize, setResize] = useState<ResizeState | null>(null);
  const elements = useCanvasStore((s) => s.elements);
  const selectedElementIds = useCanvasStore((s) => s.selectedElementIds);
  const resizeElement = useCanvasStore((s) => s.resizeElement);
  const ratioLocks = useCanvasStore((s) => s.ratioLocks);
  const selectedElementId = selectedElementIds[0] ?? null;
  const isSingleSelection = selectedElementIds.length === 1;

  const tryStart = (e: PointerEvent<HTMLDivElement>): boolean => {
    // Read-only while previewing a snapshot — no resize.
    if (useCanvasStore.getState().snapshotPreview !== null) return false;
    const handle = isResizeHandle(e.clientX, e.clientY);
    if (!(handle && selectedElementId && isSingleSelection)) return false;
    const el = elements[selectedElementId];
    if (!el) return true;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    // Start from the element as it renders: its values at the active
    // breakpoint (where the resize writes), and its measured size on any
    // axis that hugs, fills, or is auto — the stored number there is a
    // fallback, not what's on screen. see docs/archive/2026-10-14-text-resize-height-plan.md
    const { activeBreakpointId, breakpoints } = useCanvasStore.getState();
    const shown = resolveElementAtState(el, activeBreakpointId, breakpoints, null);
    const measured = geometry.measureElementInFrame(selectedElementId);
    // Open a history transaction so the per-tick `resizeElement`
    // calls during the drag don't each create their own history
    // entry. The wrapping `endHistoryTransaction` in `onEnd` commits
    // a single `resize` entry on pointer release.
    useHistoryStore.getState().beginHistoryTransaction();
    setResize({
      id: selectedElementId,
      handle,
      pointerStartX: e.clientX,
      pointerStartY: e.clientY,
      originX: shown.x,
      originY: shown.y,
      originW: shown.widthMode === 'fixed' ? shown.widthValue : measured?.w ?? shown.widthValue,
      originH: shown.heightMode === 'fixed' ? shown.heightValue : measured?.h ?? shown.heightValue,
    });
    return true;
  };

  const onMove = (e: PointerEvent<HTMLDivElement>): boolean => {
    if (!resize) return false;
    const el = elements[resize.id];
    if (!el) return true;
    const parent = geometry.parentMoveBoundsOf(el.parentId);
    const dx = (e.clientX - resize.pointerStartX) / scale;
    const dy = (e.clientY - resize.pointerStartY) / scale;

    // Ratio-locked: scale proportionally from a corner (edge handles
    // aren't rendered when locked, but ignore one defensively). Width is
    // the driver; height follows the frozen ratio. see docs/backlog-6 #1
    const ratio = ratioLocks[resize.id];
    if (ratio !== undefined) {
      const { handle } = resize;
      if (handle !== 'nw' && handle !== 'ne' && handle !== 'se' && handle !== 'sw') {
        return true;
      }
      const box = lockedCornerResize({
        handle: handle as CornerHandle,
        originX: resize.originX,
        originY: resize.originY,
        originW: resize.originW,
        originH: resize.originH,
        dx,
        ratio,
      });
      const clampedLocked = clampToParent(box.x, box.y, box.w, box.h, parent.w, parent.h);
      resizeElement(
        resize.id,
        Math.round(clampedLocked.x),
        Math.round(clampedLocked.y),
        Math.round(clampedLocked.w),
        Math.round(clampedLocked.h),
        { ...axesForHandle(handle), width: true, height: true }
      );
      return true;
    }

    let { originX: nx, originY: ny, originW: nw, originH: nh } = resize;
    if (resize.handle.includes('e')) nw = Math.max(MIN_SIZE, resize.originW + dx);
    if (resize.handle.includes('s')) nh = Math.max(MIN_SIZE, resize.originH + dy);
    if (resize.handle.includes('w')) {
      const proposedW = Math.max(MIN_SIZE, resize.originW - dx);
      nx = resize.originX + (resize.originW - proposedW);
      nw = proposedW;
    }
    if (resize.handle.includes('n')) {
      const proposedH = Math.max(MIN_SIZE, resize.originH - dy);
      ny = resize.originY + (resize.originH - proposedH);
      nh = proposedH;
    }
    const clamped = clampToParent(nx, ny, nw, nh, parent.w, parent.h);
    resizeElement(
      resize.id,
      Math.round(clamped.x),
      Math.round(clamped.y),
      Math.round(clamped.w),
      Math.round(clamped.h),
      axesForHandle(resize.handle)
    );
    return true;
  };

  const onEnd = (): void => {
    if (resize) {
      useHistoryStore
        .getState()
        .endHistoryTransaction(
          { kind: 'resize', elementIds: [resize.id] },
          useCanvasStore.getState().elements
        );
    }
    setResize(null);
  };

  return { tryStart, onMove, onEnd };
};
