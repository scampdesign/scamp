import type { AgentUsage } from '@shared/types';
/**
 * The panel's words for the Scamp Agent conversation. The transcript
 * itself is shared with main, in `@shared/agentTranscript`.
 * see docs/plans/builtin-agent-plan.md
 */
import type { TranscriptEntry } from '@shared/agentTranscript';
export { applyAgentEvent, settleTranscript, startTurn, type TranscriptEntry, type TranscriptPart, type TranscriptToolCall, } from '@shared/agentTranscript';
export declare const toolLabel: (name: string) => string;
/** One element as the context line names it. */
export type ContextSelection = {
    className: string;
    name?: string;
};
/**
 * What the agent should consider: the selection (the default), the whole
 * page while something is selected, or the whole project.
 */
export type AgentFocus = 'selection' | 'page' | 'project';
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
    focus?: AgentFocus;
}) => string;
/**
 * Tokens for one exchange, for the line under a reply. Tokens read from
 * the cache are counted apart: they cost a tenth of the rest, and a long
 * conversation re-reads its whole history at every step, so one total
 * would make a cheap exchange look expensive.
 */
export declare const formatUsage: (usage: AgentUsage) => string;
/**
 * A reply's words, as the agent wrote them — Markdown and all, so they
 * paste into a document or an issue the way they read in the panel.
 * Tool calls and confirmations are the panel's, not the agent's words.
 */
export declare const replyText: (entry: Extract<TranscriptEntry, {
    role: "assistant";
}>) => string;
