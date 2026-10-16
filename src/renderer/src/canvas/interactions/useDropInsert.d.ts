import { type DragEvent } from 'react';
import type { CanvasGeometry } from './types';
export type DropInsert = {
    handleDragOver: (e: DragEvent<HTMLDivElement>) => void;
    handleDrop: (e: DragEvent<HTMLDivElement>) => void;
};
export declare const useDropInsert: (geometry: CanvasGeometry) => DropInsert;
