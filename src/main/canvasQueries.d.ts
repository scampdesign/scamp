import { BrowserWindow } from 'electron';
import type { ToolInvoker } from './mcp/protocol';
/** Register the reply listener once, at app start. */
export declare const initCanvasQueries: (win: BrowserWindow) => void;
/** Fail every question still waiting — the project is closing. */
export declare const rejectCanvasQueries: (reason: string) => void;
/**
 * The read tools, answered about `projectPath`. Most go to the renderer;
 * routes and imported originals are read from disk here.
 */
export declare const canvasToolInvoker: (projectPath: string) => ToolInvoker;
