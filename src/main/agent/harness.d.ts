import type { BetaMessageParam, BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { AgentEvent, AgentTurnOutcome, AgentUsage } from '@shared/types';
import type { ToolResult } from '../mcp/protocol';
import type { AgentProvider } from './provider';
/**
 * One turn of the agent: the user's message, then as many model calls and
 * tool rounds as it takes to answer.
 *
 * The history is append-only. Thinking blocks are bound to the
 * conversation that produced them, so an earlier turn is never edited or
 * trimmed — and nothing is appended that would leave the history invalid
 * (a `tool_use` with no matching result), so a turn that ends early still
 * leaves a conversation the next message can continue.
 * see docs/archive/2026-10-06-builtin-agent-plan.md
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** An event before the session stamps it with its turn. */
export type HarnessEvent = DistributiveOmit<AgentEvent, 'turnId'>;
/**
 * Runs one tool. An edit's result carries a one-line `summary` the panel
 * shows in place of the tool's name.
 */
export type AgentToolInvoker = (name: string, args: Record<string, unknown>) => Promise<ToolResult & {
    summary?: string;
}>;
export type RunTurnOptions = {
    provider: AgentProvider;
    system: string;
    tools: BetaTool[];
    invoke: AgentToolInvoker;
    history: ReadonlyArray<BetaMessageParam>;
    userContent: string;
    effort: 'low' | 'medium' | 'high';
    signal: AbortSignal;
    emit: (event: HarnessEvent) => void;
    /** Model calls allowed for one user message. */
    maxSteps?: number;
    /**
     * Asked before a reply's tools run. Resolves false when the user
     * declines; omitted means everything runs.
     */
    review?: (calls: ReadonlyArray<{
        name: string;
        input: unknown;
    }>) => Promise<boolean>;
    /**
     * Operator instructions for this turn on — a skill's — sent as a
     * mid-conversation system message after the user's words, so the cached
     * system prompt in front of it never changes.
     */
    systemNote?: string;
};
export type RunTurnResult = {
    history: BetaMessageParam[];
    outcome: AgentTurnOutcome;
    usage: AgentUsage;
    message?: string;
    /** Set when the provider rejected the key, so the caller can say so in Settings. */
    keyRejected?: boolean;
};
export declare const DEFAULT_MAX_STEPS = 24;
export declare const runTurn: (options: RunTurnOptions) => Promise<RunTurnResult>;
export {};
