import type { AgentKeyRejection, AgentKeySetResult, AgentKeyStatus } from '@shared/types';
import { type TokenStoreDeps } from '../auth/tokenStore';
/**
 * The user's own provider key: held in main, stored encrypted, never
 * handed to the renderer.
 *
 * Everything with a side effect is injected — storage, the provider check,
 * whether the user is signed in — so this runs in a unit test with no
 * Electron and no network.
 * see docs/plans/builtin-agent-plan.md
 */
export type VerifyOutcome = {
    ok: true;
} | {
    ok: false;
    reason: AgentKeyRejection;
    message: string;
};
export type ProviderKeyDeps = TokenStoreDeps & {
    /** Ask the provider whether the key works for the agent's model. */
    verify: (key: string) => Promise<VerifyOutcome>;
    /** The agent is for signed-in users; main checks, not just the UI. */
    isSignedIn: () => boolean;
};
export type ProviderKey = {
    status: () => Promise<AgentKeyStatus>;
    set: (raw: string) => Promise<AgentKeySetResult>;
    clear: () => Promise<void>;
    /** The key, for the harness. Null when there is none or the user is signed out. */
    current: () => Promise<string | null>;
    /** The provider rejected the key mid-session. */
    markInvalid: () => void;
};
export declare const createProviderKey: (deps: ProviderKeyDeps) => ProviderKey;
