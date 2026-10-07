import { BrowserWindow } from 'electron';
import type { ToolInvoker } from './mcp/protocol';
/** What the renderer answers an edit with. */
export type AgentEditAnswer = {
    ok: boolean;
    text: string;
    summary?: string;
    createdComponent?: string;
    /** The edit changed a view behind the canvas; the project needs re-reading. */
    refreshProject?: boolean;
};
/** Ask the renderer to make one edit for the agent's turn `turnId`. */
export declare const runAgentEdit: (tool: string, input: Record<string, unknown>, turnId: string) => Promise<AgentEditAnswer>;
/** Register the reply listener once, at app start. */
export declare const initCanvasQueries: (win: BrowserWindow) => void;
/** Fail every question still waiting — the project is closing. */
export declare const rejectCanvasQueries: (reason: string) => void;
/**
 * The read tools, answered about `projectPath`. Most go to the renderer;
 * routes and imported originals are read from disk here.
 */
export declare const canvasToolInvoker: (projectPath: string) => ToolInvoker;
