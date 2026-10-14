import type { AgentEvent, AgentTurnOutcome, AgentUsage } from './types';
/**
 * The Scamp Agent conversation as the panel shows it, built from the
 * events main streams back. Pure and shared: the panel folds events into
 * it as they arrive, and main folds the same events to keep each page's
 * conversation on disk.
 * see docs/archive/2026-10-06-builtin-agent-plan.md
 */
export type TranscriptToolCall = {
    id: string;
    name: string;
    status: 'running' | 'ok' | 'failed';
    /** What an edit changed, when it says. Shown instead of the tool's label. */
    summary?: string;
};
/** A reply is text and tool calls interleaved, in the order they happened. */
export type TranscriptPart = {
    kind: 'text';
    text: string;
} | {
    kind: 'tools';
    calls: TranscriptToolCall[];
}
/** Edits waiting on the user's say-so, and what they said. */
 | {
    kind: 'confirm';
    id: string;
    items: string[];
    state: 'pending' | 'approved' | 'declined';
};
export type TranscriptEntry = {
    role: 'user';
    id: string;
    text: string;
    context: string;
}
/** Something Scamp did, said in the conversation — "Undid the agent's changes." */
 | {
    role: 'note';
    id: string;
    text: string;
} | {
    role: 'assistant';
    /** The turn id main assigned. */
    id: string;
    parts: TranscriptPart[];
    /** The agent's current note on what it's doing; cleared as it acts. */
    progress: string;
    status: 'working' | AgentTurnOutcome;
    message?: string;
    usage?: AgentUsage;
};
/** A user message and the reply it's waiting for. */
export declare const startTurn: (entries: ReadonlyArray<TranscriptEntry>, turnId: string, text: string, context: string) => TranscriptEntry[];
/**
 * Fold one event in. An event for a turn the transcript doesn't have — one
 * from before a reset — is ignored.
 */
export declare const applyAgentEvent: (entries: ReadonlyArray<TranscriptEntry>, event: AgentEvent) => TranscriptEntry[];
/**
 * A transcript read back from disk, made safe to show: a reply that was
 * still working when it was saved can't finish now, and a question it
 * asked can't be answered.
 */
export declare const settleTranscript: (entries: ReadonlyArray<TranscriptEntry>) => TranscriptEntry[];
