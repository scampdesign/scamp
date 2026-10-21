import type { AgentEditContext, AgentEditResult } from './agentEdits';
export declare const VARIANT_ACTIONS: readonly ["add_property", "remove_property", "add_value", "remove_value", "make_default", "add_interaction", "remove_interaction"];
export type VariantAction = (typeof VARIANT_ACTIONS)[number];
/**
 * Add, remove, or change a component's variant properties (axes), their
 * values, and its interactions. `property` is the axis; `values` (for a
 * new property) lists its values, the first being the default.
 */
export declare const editVariants: (ctx: AgentEditContext, args: Record<string, unknown>) => AgentEditResult;
