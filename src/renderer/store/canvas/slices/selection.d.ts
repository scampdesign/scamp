import type { StateCreator } from 'zustand';
import { type CanvasState } from '../../canvasSlice';
export declare const createSelectionSlice: StateCreator<CanvasState, [
], [
], Pick<CanvasState, 'selectedElementIds' | 'editingElementId' | 'editingInstanceProp' | 'textSelection' | 'setTextSelection' | 'activeTool' | 'setTool' | 'selectElement' | 'toggleSelectElement' | 'setEditingElement' | 'setEditingInstanceProp'>>;
