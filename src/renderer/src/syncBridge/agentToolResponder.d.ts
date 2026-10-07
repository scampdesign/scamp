export type AgentEditAnswer = {
    ok: boolean;
    text: string;
    summary?: string;
    /** A component this edit created — main tracks it so Undo AI session can remove it. */
    createdComponent?: string;
    /** Files changed behind the canvas — main has the project re-read. */
    refreshProject?: boolean;
};
/** The turn is over: commit its edits as one undo step. */
export declare const endAgentTurnHistory: (turnId: string) => void;
/** Make one edit, for turn `turnId`. Exported for tests. */
export declare const executeAgentEdit: (tool: string, input: Record<string, unknown>, turnId: string) => Promise<AgentEditAnswer>;
export declare const installAgentToolResponder: () => (() => void);
