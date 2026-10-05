export type AgentEditAnswer = {
    ok: boolean;
    text: string;
    summary?: string;
};
/** The turn is over: commit its edits as one undo step. */
export declare const endAgentTurnHistory: (turnId: string) => void;
/** Make one edit, for turn `turnId`. Exported for tests. */
export declare const executeAgentEdit: (tool: string, input: Record<string, unknown>, turnId: string) => AgentEditAnswer;
export declare const installAgentToolResponder: () => (() => void);
