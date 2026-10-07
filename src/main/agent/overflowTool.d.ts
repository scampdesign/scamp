import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
/**
 * What overflows on a view, measured on a render of it rather than read
 * off its styles. Answered by the renderer, which builds the view's HTML
 * export, and main, which lays it out (`overflowRender.ts`). Built-in only.
 * see docs/notes/agent-overflow-check.md
 */
export declare const OVERFLOW_TOOL: BetaTool;
