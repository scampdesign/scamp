import { type DragEvent } from 'react';

import { useCanvasStore } from '@store/canvasSlice';
import { ROOT_ELEMENT_ID } from '@lib/element';

import { prepareSvgForInsert } from '../../lib/svg';
import { hitTest } from './canvasHitTest';
import { DEFAULT_IMAGE_SIZE, INLINE_SVG_MAX_BYTES } from './constants';
import type { CanvasGeometry } from './types';
import { importImage } from '@renderer/src/lib/importImage';

export type DropInsert = {
  handleDragOver: (e: DragEvent<HTMLDivElement>) => void;
  handleDrop: (e: DragEvent<HTMLDivElement>) => void;
};

/**
 * Accepts image files dropped onto the canvas from the OS file manager.
 * Raster images are copied into the project's assets dir and inserted as
 * `<img>`. SVGs are sanitized/normalized and inlined as an editable
 * `<svg>` element (so fill/stroke are editable), unless they're larger
 * than INLINE_SVG_MAX_BYTES, in which case they fall back to the asset +
 * `<img>` path. see docs/archive/2026-06-30-svg-improvements-plan.md
 */
export const useDropInsert = (geometry: CanvasGeometry): DropInsert => {
  const activePage = useCanvasStore((s) => s.activePage);
  const activeComponent = useCanvasStore((s) => s.activeComponent);
  const projectPath = useCanvasStore((s) => s.projectPath);
  const createImage = useCanvasStore((s) => s.createImage);
  const createSvgElement = useCanvasStore((s) => s.createSvgElement);

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    // Accept image files from the OS file manager.
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (!activePage && !activeComponent) return;
    const files = e.dataTransfer.files;
    if (files.length === 0) return;
    const file = files[0]!;
    // Only accept image types (svg counts as image/svg+xml).
    if (!file.type.startsWith('image/')) return;

    const hitId = hitTest(e.clientX, e.clientY) ?? ROOT_ELEMENT_ID;
    const parentRect =
      geometry.measureElementInFrame(hitId) ?? { x: 0, y: 0, w: 0, h: 0 };
    const { x, y } = geometry.toFrame(e.clientX, e.clientY);
    const parent = geometry.parentSizeOf(hitId);

    // Place a w×h box at the drop point in the parent's local space,
    // clamped inside the parent.
    const placement = (w: number, h: number): { x: number; y: number } => ({
      x: Math.round(Math.max(0, Math.min(x - parentRect.x, parent.w - w))),
      y: Math.round(Math.max(0, Math.min(y - parentRect.y, parent.h - h))),
    });

    const filePath = (file as File & { path?: string }).path;

    const insertRaster = async (): Promise<void> => {
      if (!filePath || !projectPath) return;
      const copied = await importImage(filePath, projectPath);
      if (copied === null) return;
      const pos = placement(DEFAULT_IMAGE_SIZE, DEFAULT_IMAGE_SIZE);
      createImage({
        parentId: hitId,
        x: pos.x,
        y: pos.y,
        width: DEFAULT_IMAGE_SIZE,
        height: DEFAULT_IMAGE_SIZE,
        src: copied.relativePath,
        alt: copied.fileName,
      });
    };

    const isSvg =
      file.type === 'image/svg+xml' ||
      file.name.toLowerCase().endsWith('.svg');
    if (isSvg) {
      void (async (): Promise<void> => {
        const text = await file.text();
        const prepared = prepareSvgForInsert(text);
        // Inline small, editable SVGs; fall back to <img> for large ones
        // (or anything that didn't parse to a usable svg).
        if (prepared && text.length <= INLINE_SVG_MAX_BYTES) {
          const w = Math.round(prepared.width ?? DEFAULT_IMAGE_SIZE);
          const h = Math.round(prepared.height ?? DEFAULT_IMAGE_SIZE);
          const pos = placement(w, h);
          createSvgElement({
            parentId: hitId,
            x: pos.x,
            y: pos.y,
            width: w,
            height: h,
            svgSource: prepared.svgSource,
            ...(prepared.viewBox !== undefined ? { viewBox: prepared.viewBox } : {}),
            ...(prepared.fill !== undefined ? { fill: prepared.fill } : {}),
            ...(prepared.stroke !== undefined ? { stroke: prepared.stroke } : {}),
            ...(prepared.strokeWidth !== undefined
              ? { strokeWidth: prepared.strokeWidth }
              : {}),
          });
          return;
        }
        await insertRaster();
      })();
      return;
    }

    void insertRaster();
  };

  return { handleDragOver, handleDrop };
};
