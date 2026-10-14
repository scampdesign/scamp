/**
 * When the Scamp Agent stops and asks before editing.
 *
 * Deterministic, in the harness, not left to the model: a destructive edit
 * always asks, and so does a burst of edits big enough that the user
 * should see the list before it lands. The model is also told to describe
 * and ask first for large changes; this is what holds when it doesn't.
 * see docs/archive/2026-10-06-builtin-agent-plan.md
 */
/** Edits that always ask. */
export declare const ALWAYS_CONFIRM: ReadonlySet<string>;
/** More edits than this in one reply, and the reply asks first. */
export declare const BATCH_LIMIT = 5;
export type ToolCall = {
    name: string;
    input: unknown;
};
/**
 * `planApproved`: a skill session where the user already approved a plan
 * — the many-edits check would only interrupt agreed work. Deletes,
 * components and theme changes ask regardless.
 */
export declare const needsConfirmation: (calls: ReadonlyArray<ToolCall>, options?: {
    planApproved?: boolean;
}) => boolean;
/** One edit, said as the confirmation card lists it — naming the view when it isn't the conversation's. */
export declare const describeToolCall: (call: ToolCall) => string;
