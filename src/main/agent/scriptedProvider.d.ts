import type { BetaStopReason } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { AgentProvider } from './provider';
/**
 * A provider that plays back a script, for tests and the e2e suite — so
 * neither ever calls Anthropic or needs a key.
 *
 * `echo_tool_result` answers with the last tool result it was sent, which
 * is how a test proves a tool really ran in the renderer and its answer
 * really came back.
 */
export type ScriptedBlock = {
    type: 'text';
    text: string;
} | {
    type: 'tool_use';
    name: string;
    input: Record<string, unknown>;
} | {
    type: 'echo_tool_result';
};
export type ScriptedTurn = {
    content: ScriptedBlock[];
    stop_reason?: BetaStopReason;
    /** Throw this instead of answering — a provider failure. */
    error?: unknown;
};
export declare const createScriptedProvider: (script: ReadonlyArray<ScriptedTurn>) => AgentProvider & {
    requests: number;
};
