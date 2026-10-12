import { type CanvasState } from '@store/canvasSlice';
import { useTerminalActivityStore } from '@store/terminalActivitySlice';
import type { SaveContext } from './saveContext';
type TerminalActivityState = ReturnType<typeof useTerminalActivityStore.getState>;
/**
 * React when the user pauses or resumes sync. Pause: cancel the debounce
 * so nothing lands mid-pause. Resume: if the quiet window is also clear,
 * reconcile now; otherwise the quiet-resume timer does it when it expires.
 */
export declare const makeAgentSubscriptionHandler: (ctx: SaveContext) => (s: TerminalActivityState) => void;
/**
 * The canvas-store subscription: detects target swaps (flush outgoing,
 * reset the write cache), refreshes the cache + canonically migrates on
 * load, and schedules the debounced disk write on a genuine canvas edit.
 */
export declare const makeStoreSubscriptionHandler: (ctx: SaveContext) => (state: CanvasState, prev: CanvasState) => void;
export {};
