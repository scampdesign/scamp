import type { AgentConversationKey, AgentEvent, AgentSkillRequest, AgentTokenMode, ImportReportGroup } from '@shared/types';
import { type AgentFocus, type TranscriptEntry } from '@lib/agentTranscript';
/**
 * The Scamp Agent conversation in the renderer. Each page, view and
 * component has its own; main owns them and keeps them on disk, and this
 * is the one the panel shows — read from main when it opens, then folded
 * from the events main streams back.
 * see docs/archive/2026-10-06-builtin-agent-plan.md
 */
export type AgentState = {
    /** The project this conversation belongs to. */
    projectPath: string | null;
    /** Which conversation the panel shows. */
    conversation: AgentConversationKey | null;
    entries: TranscriptEntry[];
    /** A turn is in flight — in this conversation or another. */
    busy: boolean;
    /** The turn in flight, and the conversation it belongs to. */
    runningTurn: {
        turnId: string;
        conversation: AgentConversationKey;
    } | null;
    /** What the agent should consider; the user picks it under the composer. */
    focus: AgentFocus;
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
    /** The conversation the cleanup runs in. */
    cleanupConversation: AgentConversationKey | null;
    /** Show this page's, view's or component's conversation. */
    openConversation: (projectPath: string, key: AgentConversationKey) => Promise<void>;
    setFocus: (focus: AgentFocus) => void;
    recordImport: (projectPath: string, viewName: string, report: ImportReportGroup[]) => void;
    /** The views a React import made in this project, and what it kept as copies. */
    reactImport: {
        projectPath: string;
        appName: string;
        views: string[];
        notes: string[];
    } | null;
    recordReactImport: (projectPath: string, appName: string, views: string[], notes: string[]) => void;
    /** Tidy one of those views from the app's source, in a new conversation. */
    startReactTidy: (viewName: string) => Promise<void>;
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
        conversation?: AgentConversationKey;
    }) => Promise<void>;
    cancel: () => void;
    /** Start this conversation over; its saved history is deleted. */
    reset: () => Promise<void>;
    applyEvent: (event: AgentEvent) => void;
};
/** The page, view or component open on the canvas — and so its conversation. */
export declare const currentConversationKey: () => AgentConversationKey | null;
export declare const sameConversation: (a: AgentConversationKey | null, b: AgentConversationKey | null) => boolean;
/** What the agent is looking at, read from the canvas right now. */
export declare const currentAgentContext: (focus?: AgentFocus) => string;
/**
 * After a turn ends. The plan turn hands over to the user; the applying
 * turn ends the cleanup; anything that didn't finish ends it too, so the
 * panel never offers to apply a plan that wasn't written.
 */
export declare const nextCleanupPhase: (phase: AgentState["cleanupPhase"], event: Extract<AgentEvent, {
    kind: "turn-end";
}>) => AgentState["cleanupPhase"];
/** A skill in this conversation is planning, waiting on approval, or applying. */
export declare const skillAtWork: (state: Pick<AgentState, "cleanupPhase" | "cleanupConversation">, conversation: AgentConversationKey) => boolean;
/** The token mode picked last time in this project — a convenience only. */
export declare const rememberedTokenMode: (projectPath: string) => AgentTokenMode | null;
export declare const useAgentStore: import("zustand").UseBoundStore<import("zustand").StoreApi<AgentState>>;
