import type { AgentKeyControls } from './useAgentKey';
type Props = {
    keyControls: AgentKeyControls;
};
/**
 * The panel's state before a key is connected — or after Anthropic stops
 * accepting it. Connecting here does what Settings → AI provider does.
 */
export declare const AgentConnect: ({ keyControls }: Props) => JSX.Element;
export {};
