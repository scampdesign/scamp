/**
 * Makes the Scamp Agent's edits. Main asks, this answers — once per
 * request, always, since main is waiting on a timeout.
 *
 * An edit goes through `@lib/agentEdits` (Scamp's own generate → parse
 * round trip). On the open view it lands in the store like any panel
 * edit, so the normal save path writes it, and a turn's edits are one
 * history transaction: one Cmd+Z undoes everything the agent did for one
 * message. Any other view is edited in its files (`agentOffCanvas`).
 * see docs/archive/2026-10-06-builtin-agent-plan.md, docs/notes/agent-whole-project.md
 */
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
