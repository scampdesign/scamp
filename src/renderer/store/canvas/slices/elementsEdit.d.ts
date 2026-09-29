import type { StateCreator } from 'zustand';
import { type CanvasState } from '../../canvasSlice';
export declare const createElementsEditSlice: StateCreator<CanvasState, [
], [
], Pick<CanvasState, 'previewAnimation' | 'setPropOverride' | 'clearPropOverride' | 'setElementText' | 'styleTextRange' | 'togglePropOnText' | 'renamePropOnText' | 'toggleSlotOnRect' | 'renameSlot' | 'setElementSlotName' | 'moveElement' | 'resizeElement' | 'patchElement' | 'patchCustomProperties' | 'resetElementFieldsAtBreakpoint' | 'resetElementFieldsAtState' | 'setAnimation' | 'removeAnimation' | 'togglePropertyGroup' | 'playAnimation'>>;
