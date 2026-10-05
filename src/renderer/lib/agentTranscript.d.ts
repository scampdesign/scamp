import type { AgentEvent, AgentTurnOutcome, AgentUsage } from '@shared/types';
/**
 * The Scamp Agent conversation as the panel shows it, built from the
 * events main streams back. Pure, so the panel is a view of this and
 * nothing else.
 * see docs/plans/builtin-agent-plan.md
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
export declare const toolLabel: (name: string) => string;
/** One element as the context line names it. */
export type ContextSelection = {
    className: string;
    name?: string;
};
/**
 * The line that tells the agent — and the user, in the panel — what the
 * agent is looking at.
 */
export declare const agentContextLine: (input: {
    target: {
        kind: "page" | "component" | "view";
        name: string;
    } | null;
    selection: ReadonlyArray<ContextSelection>;
}) => string;
/** Tokens for one exchange, for the line under a reply. */
export declare const formatUsage: (usage: AgentUsage) => string;
/**
 * Split a reply on `backtick` spans so class names and CSS read as code.
 * Returns plain segments, never markup — the panel renders each as a text
 * node, so nothing in a reply can inject HTML. An unclosed backtick is
 * left as written.
 */
export declare const splitInlineCode: (text: string) => Array<{
    code: boolean;
    text: string;
}>;
