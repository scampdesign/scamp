import { type AgentEditContext, type AgentEditResult } from '@lib/agentEdits';
import type { ComponentKind } from '@shared/types';
/**
 * The Scamp Agent's edits to a view or component that isn't open on the
 * canvas: read its files, make the edit through `@lib/agentEdits`, write
 * them back with the same incremental patch a save uses.
 * see docs/notes/agent-whole-project.md
 */
export type OffCanvasAnswer = {
    ok: boolean;
    text: string;
    summary?: string;
    createdComponent?: string;
    /** The files changed behind the canvas — main re-reads the project. */
    refreshProject?: boolean;
};
/** The turn is over; the next one reads the files again. */
export declare const forgetOffCanvasDrafts: () => void;
/** The view is on the canvas now, so the canvas is its truth. */
export declare const forgetOffCanvasDraft: (name: string) => void;
/** An element edit — the same `@lib/agentEdits` call the canvas makes — on another view. */
export declare const editOffCanvas: (projectPath: string, name: string, kind: ComponentKind, edit: (ctx: AgentEditContext) => AgentEditResult) => Promise<OffCanvasAnswer>;
/** `scamp_use_component` on another view. */
export declare const swapInOffCanvas: (projectPath: string, name: string, kind: ComponentKind, input: Record<string, unknown>) => Promise<OffCanvasAnswer>;
/** `scamp_extract_component` on another view. */
export declare const extractOffCanvas: (projectPath: string, name: string, kind: ComponentKind, input: Record<string, unknown>) => Promise<OffCanvasAnswer>;
