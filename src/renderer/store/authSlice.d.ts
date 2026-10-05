import type { AuthStatusResult, AuthUser } from '@shared/types';
/**
 * Whether the user is signed in to Scamp, for anything that is gated on it.
 *
 * Mirrors main, which owns the session: `App` seeds it from `authStatus` and
 * keeps it current from the `auth:complete` broadcast, which fires on sign-in,
 * sign-out, and a session the heartbeat found gone. The token itself never
 * reaches the renderer. `unknown` until the first answer, so a gated surface
 * doesn't flash in for a signed-out user.
 * see docs/plans/builtin-agent-plan.md
 */
export type AuthState = {
    status: 'unknown' | 'signed-in' | 'signed-out';
    user: AuthUser | null;
    applyStatus: (result: AuthStatusResult) => void;
};
export declare const useAuthStore: import("zustand").UseBoundStore<import("zustand").StoreApi<AuthState>>;
/** True only once main has said the user is signed in. */
export declare const useIsSignedIn: () => boolean;
