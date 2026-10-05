import type { AgentKeyStatus } from '@shared/types';
export type AgentKeyControls = {
    /** Null until main answers. */
    status: AgentKeyStatus | null;
    checking: boolean;
    error: string | null;
    connect: (key: string) => Promise<boolean>;
    disconnect: () => Promise<void>;
};
/**
 * The provider key's status and the two things a user can do with it.
 * Shared by Settings and the Agent panel's connect prompt. The key passes
 * through `connect` once and is never held here.
 */
export declare const useAgentKey: (enabled: boolean) => AgentKeyControls;
