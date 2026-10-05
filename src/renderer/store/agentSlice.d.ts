import type { AgentEvent } from '@shared/types';
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
    send: (text: string) => Promise<void>;
    cancel: () => void;
    reset: () => void;
    applyEvent: (event: AgentEvent) => void;
};
/** What the agent is looking at, read from the canvas right now. */
export declare const currentAgentContext: () => string;
export declare const useAgentStore: import("zustand").UseBoundStore<import("zustand").StoreApi<AgentState>>;
