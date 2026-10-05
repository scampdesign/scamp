import type { BetaMessageParam, BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { AgentEvent, AgentTurnOutcome, AgentUsage } from '@shared/types';
import type { ToolInvoker } from '../mcp/protocol';
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
 * see docs/plans/builtin-agent-plan.md
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** An event before the session stamps it with its turn. */
export type HarnessEvent = DistributiveOmit<AgentEvent, 'turnId'>;
export type RunTurnOptions = {
    provider: AgentProvider;
    system: string;
    tools: BetaTool[];
    invoke: ToolInvoker;
    history: ReadonlyArray<BetaMessageParam>;
    userContent: string;
    effort: 'low' | 'medium' | 'high';
    signal: AbortSignal;
    emit: (event: HarnessEvent) => void;
    /** Model calls allowed for one user message. */
    maxSteps?: number;
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
