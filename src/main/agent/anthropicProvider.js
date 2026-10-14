import Anthropic from '@anthropic-ai/sdk';
import { AGENT_MODEL } from './config';
/**
 * The Claude provider, on the user's own key.
 *
 * - Thinking is always on for this model; `display: 'updates'` returns the
 *   short notes it writes between tool calls, which is what the panel's
 *   "working" line shows. Effort is set explicitly — this model's default
 *   is `medium`, one below what agentic work usually wants.
 * - Each thinking block is bound to the system prompt and tools it was
 *   written under. A saved conversation outlives both — every Scamp update
 *   that changes them would otherwise 400 it ("couldn't accept this
 *   conversation") — so a stale block is dropped, not the whole request.
 * - Server-side fallbacks are opt-in and cost nothing unless a request is
 *   declined, so they're on.
 * - The system prompt carries a cache breakpoint (tools render before it,
 *   so they're covered too), and top-level automatic caching covers the
 *   growing history.
 * see docs/archive/2026-10-06-builtin-agent-plan.md
 */
export const createAnthropicProvider = (apiKey) => {
    const client = new Anthropic({ apiKey });
    return {
        streamTurn: async (request, callbacks) => {
            const stream = client.beta.messages.stream({
                model: AGENT_MODEL,
                max_tokens: 64_000,
                betas: ['thinking-display-updates-2026-08-18', 'server-side-fallback-2026-07-01', 'thinking-binding-controls-2026-08-01'],
                fallbacks: 'default',
                thinking: { type: 'adaptive', display: 'updates', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
                output_config: { effort: request.effort },
                cache_control: { type: 'ephemeral' },
                system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
                tools: request.tools,
                messages: request.messages,
            }, { signal: request.signal });
            stream.on('text', (delta) => callbacks.onText(delta));
            stream.on('thinking', (delta) => callbacks.onProgress(delta));
            return stream.finalMessage();
        },
    };
};
