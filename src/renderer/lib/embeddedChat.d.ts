/**
 * Embedded Scamp's conversation with its agent, as turns: what the user
 * sent (a batch of edits, or words), and what the agent said and did in
 * reply, with the run it wrote so the turn can be undone. Pure.
 * see docs/plans/embedded-canvas-gaps.md (gap 13)
 */
export type ChatTurnStatus = 'running' | 'done' | 'error' | 'stopped' | 'undone';
export type ChatTurn = {
    id: string;
    role: 'user';
    lines: string[];
} | {
    id: string;
    role: 'agent';
    text: string;
    tools: Array<{
        text: string;
        ok: boolean;
    }>;
    status: ChatTurnStatus;
    runId?: string;
    message?: string;
};
/** A run began: the user's batch, then the agent's turn, running. */
export declare const startTurn: (chat: ReadonlyArray<ChatTurn>, id: string, lines: ReadonlyArray<string>) => ChatTurn[];
/** Streamed text, added to the running turn. */
export declare const addAgentText: (chat: ReadonlyArray<ChatTurn>, text: string) => ChatTurn[];
/** A tool the agent used, in a few words. */
export declare const addAgentTool: (chat: ReadonlyArray<ChatTurn>, text: string, ok: boolean) => ChatTurn[];
/** The run ended: done, with an error, or stopped by the user. */
export declare const endTurn: (chat: ReadonlyArray<ChatTurn>, runId: string, status: Exclude<ChatTurnStatus, "running" | "undone">, message?: string) => ChatTurn[];
/** What a turn wrote was undone, or redone. */
export declare const setTurnUndone: (chat: ReadonlyArray<ChatTurn>, runId: string, undone: boolean) => ChatTurn[];
