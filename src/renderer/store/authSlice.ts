import { create } from 'zustand';

import type { AuthStatusResult, AuthUser } from '@shared/types';

/**
 * Whether the user is signed in to Scamp, for anything that is gated on it.
 *
 * Mirrors main, which owns the session: `App` seeds it from `authStatus` and
 * keeps it current from the `auth:complete` broadcast, which fires on sign-in,
 * sign-out, and a session the heartbeat found gone. The token itself never
 * reaches the renderer. `unknown` until the first answer, so a gated surface
 * doesn't flash in for a signed-out user.
 * see docs/archive/2026-10-06-builtin-agent-plan.md
 */
export type AuthState = {
  status: 'unknown' | 'signed-in' | 'signed-out';
  user: AuthUser | null;
  applyStatus: (result: AuthStatusResult) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  user: null,
  applyStatus: (result) =>
    set(
      result.signedIn
        ? { status: 'signed-in', user: result.user ?? null }
        : { status: 'signed-out', user: null }
    ),
}));

/** True only once main has said the user is signed in. */
export const useIsSignedIn = (): boolean => useAuthStore((s) => s.status === 'signed-in');
