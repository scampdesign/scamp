import type { BetaMessage, BetaMessageParam, BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
/**
 * What the harness needs from a model provider: one streamed turn.
 *
 * Shaped in Anthropic's message types, because the history has to be
 * stored in them anyway — thinking blocks are bound to the conversation
 * and must be replayed exactly. A second provider translates at this seam.
 * see docs/archive/2026-10-06-builtin-agent-plan.md
 */
export type ProviderRequest = {
    /** Stable for a session, so it caches. */
    system: string;
    tools: BetaTool[];
    messages: BetaMessageParam[];
    effort: 'low' | 'medium' | 'high';
    signal: AbortSignal;
};
export type ProviderCallbacks = {
    onText: (delta: string) => void;
    /** Between-tool progress notes, when the provider gives them. */
    onProgress: (delta: string) => void;
};
export type AgentProvider = {
    /** Resolves with the complete message; rejects with the provider's typed error. */
    streamTurn: (request: ProviderRequest, callbacks: ProviderCallbacks) => Promise<BetaMessage>;
};
