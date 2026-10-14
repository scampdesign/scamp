import { type DragEvent } from 'react';
import type { CanvasGeometry } from './types';
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
export declare const useDropInsert: (geometry: CanvasGeometry) => DropInsert;
