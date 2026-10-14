import {
  DragEvent,
  MouseEvent,
  PointerEvent,
  RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useCanvasStore, selectIsRatioLocked } from '@store/canvasSlice';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { SelectionOverlay } from './SelectionOverlay';
import { DrawPreview } from './DrawPreview';
import { GridOverlay } from './GridOverlay';
import { LinkIndicators } from './LinkIndicators';
import { hitTest, instanceAt, propTextHitTest } from './interactions/canvasHitTest';
import { resolveInsertParent } from '@lib/insertParent';
import { useCanvasGeometry } from './interactions/useCanvasGeometry';
import { useDrawInteraction } from './interactions/useDrawInteraction';
import { useMoveInteraction } from './interactions/useMoveInteraction';
import { useResizeInteraction } from './interactions/useResizeInteraction';
import { useReorderInteraction } from './interactions/useReorderInteraction';
import { useDropInsert } from './interactions/useDropInsert';
import {
  COMPONENT_DRAG_MIME,
  useComponentDrop,
} from './interactions/useComponentDrop';
import type { SelectedRect } from './interactions/types';
import styles from './CanvasInteractionLayer.module.css';

type Props = {
  frameRef: RefObject<HTMLDivElement>;
  scale: number;
};

/**
 * The chrome layer that sits above the rendered canvas and owns all
 * pointer interaction. It holds the selection-overlay measurement and the
 * select-tool hit-testing, and dispatches drags to the per-tool state
 * machines: draw (rectangle / input / text / image), move, resize, reorder
 * (flex children), and OS image drop. See interactions/ for each hook.
 */
export const CanvasInteractionLayer = ({ frameRef, scale }: Props): JSX.Element => {
  const layerRef = useRef<HTMLDivElement>(null);
  // The selected element's bounding box, measured straight from the DOM in
  // frame-local (unscaled) coordinates. We measure rather than compute from
  // `el.x/el.y` so the overlay matches the rendered position exactly even
  // when layout quirks (padding, borders, flex flow) shift the element off
  // its stored coordinates.
  const [selectedRect, setSelectedRect] = useState<SelectedRect | null>(null);

  const elements = useCanvasStore((s) => s.elements);
  // The "primary" selection — used for resize-handle positioning, drag-to-
  // move, and as the focus of the properties panel. Multi-select highlights
  // are handled per-element via ElementRenderer.
  const selectedElementIds = useCanvasStore((s) => s.selectedElementIds);
  const selectedElementId = selectedElementIds[0] ?? null;
  const isSingleSelection = selectedElementIds.length === 1;
  const editingElementId = useCanvasStore((s) => s.editingElementId);
  // Prop-text inline editing on a component instance. While this is
  // non-null we drop the chrome layer's `pointer-events` so the
  // contentEditable target can receive clicks (cursor positioning,
  // text selection) without the layer eating them first.
  const editingInstanceProp = useCanvasStore((s) => s.editingInstanceProp);
  const setEditingInstanceProp = useCanvasStore(
    (s) => s.setEditingInstanceProp
  );
  const selectElement = useCanvasStore((s) => s.selectElement);
  const toggleSelectElement = useCanvasStore((s) => s.toggleSelectElement);
  const setEditingElement = useCanvasStore((s) => s.setEditingElement);
  const toggleRatioLock = useCanvasStore((s) => s.toggleRatioLock);
  const ratioLocked = useCanvasStore((s) =>
    selectIsRatioLocked(s, selectedElementId)
  );
  const imageImportBusy = useCanvasStore((s) => s.imageImportBusy);

  // Frame-local geometry helpers (coord conversion, DOM measurement,
  // parent-bounds lookups) shared by every pointer handler.
  const geometry = useCanvasGeometry(frameRef, scale);
  const { measureElementInFrame, isFlexChild, isFlowChild } = geometry;

  // Per-tool pointer state machines.
  const draw = useDrawInteraction(geometry);
  const move = useMoveInteraction(geometry, scale);
  const resize = useResizeInteraction(geometry, scale);
  const reorder = useReorderInteraction(geometry);
  const dropInsert = useDropInsert(geometry);
  const componentDrop = useComponentDrop(geometry);

  // Re-measure the selected element from the DOM whenever anything that
  // could move it changes. useLayoutEffect runs after layout/render but
  // before paint, so the overlay never visibly lags the element.
  useLayoutEffect(() => {
    if (!selectedElementId) {
      setSelectedRect(null);
      return;
    }
    setSelectedRect(measureElementInFrame(selectedElementId));
    // We deliberately depend on `elements` so any change to the canvas
    // (move, resize, panel edit, file reload) re-measures the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElementId, elements, scale]);

  // Escape abandons a drag in flight: the element goes back where it
  // started and nothing is committed. Listening on window rather than the
  // layer because the pointer is captured during a drag, so the layer
  // never has keyboard focus. see docs/archive/2026-08-13-drop-placement-helpers-plan.md
  const dragActive = move.move !== null || reorder.active;
  useEffect(() => {
    if (!dragActive) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      move.cancel();
      reorder.cancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // `move` / `reorder` are recreated each render; the effect only needs
    // to re-attach when a drag starts or stops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragActive]);

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    // Shift is multi-select here, not the browser's extend-text-selection,
    // which would otherwise select the app's text from the last caret.
    if (e.shiftKey) e.preventDefault();

    // Resize takes precedence — handles sit on top of everything. Then the
    // active draw tool (rectangle / input / text / image).
    if (resize.tryStart(e)) return;
    if (draw.tryStart(e)) return;

    // Select tool
    const hitId = hitTest(e.clientX, e.clientY);
    if (!hitId) {
      // Plain click on empty canvas clears selection. Shift+click never
      // clears so the user can keep building up a multi-select set.
      if (!e.shiftKey) selectElement(null);
      return;
    }
    if (e.shiftKey) {
      toggleSelectElement(hitId);
      return;
    }
    selectElement(hitId);
    const el = elements[hitId];
    if (!el) return;
    // The root element is selectable (so the user can edit page-level
    // styles in the panel) but not draggable — moving the page frame
    // around would be meaningless.
    if (hitId === ROOT_ELEMENT_ID) {
      return;
    }
    // Flow children (flex AND grid) can't be moved by x/y — the parent
    // lays them out — but they CAN be reordered within it. Enter the
    // reorder drag state and let pointermove figure out where in the
    // sibling list the drop will land.
    if (isFlowChild(el) && el.parentId) {
      reorder.start(e, hitId, el.parentId);
      return;
    }
    move.start(e, hitId, el);
  };

  // Only one state machine is ever active per gesture, so each onMove
  // no-ops unless it owns the drag. Priority mirrors the original
  // draw → move → reorder → resize ordering.
  const handlePointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (draw.onMove(e)) return;
    if (move.onMove(e)) return;
    if (reorder.onMove(e)) return;
    resize.onMove(e);
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>): void => {
    reorder.onEnd();
    draw.onEnd();
    move.onEnd();
    resize.onEnd();
    const target = e.target as HTMLElement;
    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }
  };

  const handleDoubleClick = (e: PointerEvent<HTMLDivElement>): void => {
    // Read-only while previewing a snapshot — no inline text editing.
    if (useCanvasStore.getState().snapshotPreview !== null) return;
    // Prop-text on a component instance — enter inline edit on
    // that prop. We check this BEFORE the regular text-element path
    // so prop-text on a `<p>` tag hits the per-instance flow rather
    // than the page-level `setEditingElement`.
    const propHit = propTextHitTest(e.clientX, e.clientY);
    if (propHit) {
      e.preventDefault();
      selectElement(propHit.instanceId);
      setEditingInstanceProp(propHit);
      return;
    }
    const hitId = hitTest(e.clientX, e.clientY);
    if (hitId === ROOT_ELEMENT_ID) return;
    const el = hitId === null ? undefined : elements[hitId];
    if (el !== undefined && hitId !== null && el.type === 'text') {
      e.preventDefault();
      selectElement(hitId);
      setEditingElement(hitId);
      return;
    }
    // Into a component instance's editor. Page content in one of its
    // slots is the page's own, so only the instance itself, or the
    // component's elements drawn inside it, open the component.
    const instanceId =
      el?.type === 'component-instance'
        ? el.id
        : el === undefined
          ? instanceAt(e.clientX, e.clientY, (id) => elements[id]?.type === 'component-instance')
          : null;
    const componentName = instanceId === null ? undefined : elements[instanceId]?.componentName;
    if (componentName === undefined) return;
    e.preventDefault();
    useCanvasStore.getState().requestComponentNavigation(componentName);
  };

  // Right-click on the canvas opens the element context menu. The layer
  // sits above all canvas elements (z-index: 100), so element-level
  // onContextMenu handlers never fire — without this, Electron suppresses
  // the OS default menu and nothing visible happens. Hit-test under the
  // cursor, select that element, then dispatch the same custom event the
  // element-level handler would have, so `ElementContextMenu` renders.
  const handleContextMenu = (e: MouseEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const hitId = hitTest(e.clientX, e.clientY) ?? ROOT_ELEMENT_ID;
    selectElement(hitId);
    // Carry the click point so "Paste" can drop the elements where the
    // user right-clicked. It has to be in the *insert parent's* local
    // space, which is where the paste will actually land — the same
    // parent-relative math the text tool does. Only the canvas sends
    // this; a layers-tree right-click has no meaningful point, and
    // paste falls back to its usual offset there.
    const parentId = resolveInsertParent(elements, hitId, ROOT_ELEMENT_ID);
    const parentRect = measureElementInFrame(parentId) ?? { x: 0, y: 0, w: 0, h: 0 };
    const point = geometry.toFrame(e.clientX, e.clientY);
    window.dispatchEvent(
      new CustomEvent('scamp:open-element-context-menu', {
        detail: {
          x: e.clientX,
          y: e.clientY,
          elementId: hitId,
          canvasPoint: {
            x: Math.max(0, Math.round(point.x - parentRect.x)),
            y: Math.max(0, Math.round(point.y - parentRect.y)),
          },
        },
      })
    );
  };

  // Two independent drag sources land on this layer — OS image files and
  // the component sidebar — each gated on its own dataTransfer type, so
  // they're dispatched together rather than competing for the handler.
  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    dropInsert.handleDragOver(e);
    componentDrop.handleDragOver(e);
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    if (e.dataTransfer.types.includes(COMPONENT_DRAG_MIME)) {
      componentDrop.handleDrop(e);
      return;
    }
    dropInsert.handleDrop(e);
  };

  const selectedEl = selectedElementId ? elements[selectedElementId] : null;
  const isEditing =
    editingElementId !== null || editingInstanceProp !== null;
  const drawState = draw.draw;
  // Cross-parent reparent target — only one drag path is active per
  // gesture, so move and reorder never both report one.
  // A component dragged in from the sidebar reuses the same two
  // indicators, so hovering a container reads identically whether the
  // thing being placed is new or already on the canvas.
  const crossDrop = move.crossDrop ?? reorder.crossDrop ?? componentDrop.drop;
  // Gap line: same-parent flex reorder, or a flow (flex/grid) reparent.
  const flowIndicatorForDrop =
    reorder.dropIndicator ??
    (crossDrop?.kind === 'flow' ? crossDrop.indicator : null);
  const gapRect = flowIndicatorForDrop?.rect ?? null;
  // Outline: whichever container the element will end up in — the
  // absolute one it nests into, or the flow one whose sibling list the
  // gap line is pointing into. The line alone says where among the
  // siblings but not whose siblings they are.
  const containerRect =
    crossDrop?.kind === 'absolute'
      ? crossDrop.rect
      : (flowIndicatorForDrop?.containerRect ?? null);

  return (
    <div
      ref={layerRef}
      className={styles.layer}
      data-canvas-chrome="true"
      style={{ pointerEvents: isEditing ? 'none' : 'auto' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onDragOver={handleDragOver}
      onDragLeave={componentDrop.handleDragLeave}
      onDrop={handleDrop}
    >
      {drawState && (
        <DrawPreview
          x={Math.min(drawState.startX, drawState.currentX) + drawState.parentOffsetX}
          y={Math.min(drawState.startY, drawState.currentY) + drawState.parentOffsetY}
          width={Math.abs(drawState.currentX - drawState.startX)}
          height={Math.abs(drawState.currentY - drawState.startY)}
        />
      )}
      {gapRect && (
        <div
          className={styles.dropIndicator}
          style={{
            left: gapRect.x,
            top: gapRect.y,
            width: gapRect.w,
            height: gapRect.h,
          }}
        />
      )}
      {imageImportBusy && (
        // Over the element the image is going into when there is one,
        // otherwise centred — the image tool picks a file before any
        // element exists.
        <div
          className={styles.importOverlay}
          data-testid="image-import-busy"
          role="status"
          style={
            selectedRect
              ? {
                  left: selectedRect.x,
                  top: selectedRect.y,
                  width: selectedRect.w,
                  height: selectedRect.h,
                }
              : {
                  left: '50%',
                  top: '40%',
                  transform: 'translate(-50%, -50%)',
                  padding: '20px 28px',
                }
          }
        >
          <span className={styles.importSpinner} aria-hidden="true" />
          {(!selectedRect || selectedRect.w >= 180) && <span>Optimising image…</span>}
        </div>
      )}
      {containerRect && (
        <div
          className={styles.dropContainer}
          style={{
            left: containerRect.x,
            top: containerRect.y,
            width: containerRect.w,
            height: containerRect.h,
          }}
        />
      )}
      {isSingleSelection && selectedEl && selectedRect && (
        // Position and size come from a DOM measurement of the selected
        // element, so the overlay always sits exactly where the user sees
        // the rect — including for flex children whose stored x/y is 0.
        // Resize handles are shown for everything except the page root
        // (which is sized via the panel) and flex children (whose size is
        // owned by flex layout, not by the user dragging corners). The
        // overlay is only rendered for a single selection — multi-select
        // highlights live on the elements themselves.
        <SelectionOverlay
          x={selectedRect.x}
          y={selectedRect.y}
          width={selectedRect.w}
          height={selectedRect.h}
          showHandles={
            selectedElementId !== ROOT_ELEMENT_ID &&
            !isFlexChild(selectedEl) &&
            selectedEl.type !== 'component-instance'
          }
          // A component-instance wrapper is 0-sized, so its own `.selected`
          // outline is invisible — the overlay draws the border instead.
          drawOutline={selectedEl.type === 'component-instance'}
          ratioLocked={ratioLocked}
          onToggleLock={
            selectedElementId
              ? () => {
                  // Measure the rendered size so a non-fixed axis can be
                  // snapped to fixed on lock (see toggleRatioLock).
                  const rect = measureElementInFrame(selectedElementId);
                  toggleRatioLock(
                    selectedElementId,
                    rect ? { width: rect.w, height: rect.h } : undefined
                  );
                }
              : undefined
          }
        />
      )}
      <LinkIndicators frameRef={frameRef} />
      {isSingleSelection &&
        selectedElementId &&
        selectedEl &&
        selectedEl.display === 'grid' && (() => {
          const frame = frameRef.current;
          if (!frame) return null;
          const r = frame.getBoundingClientRect();
          return (
            <GridOverlay
              elementId={selectedElementId}
              frameRect={{ left: r.left, top: r.top }}
              scale={scale}
            />
          );
        })()}
    </div>
  );
};
