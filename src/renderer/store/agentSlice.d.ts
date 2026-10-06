import type { AgentEvent, AgentSkillRequest, AgentTokenMode, ImportReportGroup } from '@shared/types';
import { type TranscriptEntry } from '@lib/agentTranscript';
/**
 * The Scamp Agent conversation in the renderer. Main owns the real
 * history (the one the model sees); this is the transcript the panel
 * draws, folded from the events main streams back.
 * see docs/plans/builtin-agent-plan.md
 */
export type AgentState = {
    /** The project this conversation belongs to. */
    projectPath: string | null;
    entries: TranscriptEntry[];
    /** A turn is in flight. */
    busy: boolean;
    /** Why the last message couldn't be sent at all. */
    sendError: string | null;
    /** The agent has edited the canvas in this conversation, since any undo. */
    edited: boolean;
    /** The view imported most recently in this project, and its report. */
    lastImport: {
        projectPath: string;
        viewName: string;
        report: ImportReportGroup[];
    } | null;
    /**
     * Where an import cleanup is: writing its plan, waiting for the user to
     * approve it, or applying it. Null outside a cleanup.
     */
    cleanupPhase: 'planning' | 'awaiting-approval' | 'applying' | null;
    recordImport: (projectPath: string, viewName: string, report: ImportReportGroup[]) => void;
    /** Start a cleanup of the last import in a new conversation. */
    startCleanup: (tokenMode: AgentTokenMode) => Promise<void>;
    /** The user approved the plan as written. */
    approvePlan: () => Promise<void>;
    /** Restore everything to before the conversation's first edit. */
    undoSession: () => Promise<{
        ok: true;
    } | {
        ok: false;
        error: string;
    }>;
    send: (text: string, options?: {
        skill?: AgentSkillRequest;
    }) => Promise<void>;
    cancel: () => void;
    reset: () => void;
    applyEvent: (event: AgentEvent) => void;
};
/** What the agent is looking at, read from the canvas right now. */
export declare const currentAgentContext: () => string;
/**
 * After a turn ends. The plan turn hands over to the user; the applying
 * turn ends the cleanup; anything that didn't finish ends it too, so the
 * panel never offers to apply a plan that wasn't written.
 */
export declare const nextCleanupPhase: (phase: AgentState["cleanupPhase"], event: Extract<AgentEvent, {
    kind: "turn-end";
}>) => AgentState["cleanupPhase"];
/** The token mode picked last time in this project — a convenience only. */
export declare const rememberedTokenMode: (projectPath: string) => AgentTokenMode | null;
export declare const useAgentStore: import("zustand").UseBoundStore<import("zustand").StoreApi<AgentState>>;
