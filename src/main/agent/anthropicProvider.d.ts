import type { AgentProvider } from './provider';
/**
 * The Claude provider, on the user's own key.
 *
 * - Thinking is always on for this model; `display: 'updates'` returns the
 *   short notes it writes between tool calls, which is what the panel's
 *   "working" line shows. Effort is set explicitly — this model's default
 *   is `medium`, one below what agentic work usually wants.
 * - Server-side fallbacks are opt-in and cost nothing unless a request is
 *   declined, so they're on.
 * - The system prompt carries a cache breakpoint (tools render before it,
 *   so they're covered too), and top-level automatic caching covers the
 *   growing history.
 * see docs/plans/builtin-agent-plan.md
 */
export declare const createAnthropicProvider: (apiKey: string) => AgentProvider;
