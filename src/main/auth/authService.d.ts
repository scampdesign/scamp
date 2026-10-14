import { type DesktopUser, type FetchLike } from './tokenExchange';
import { type SafeStorageLike } from './tokenStore';
/**
 * The whole sign-in gesture, start to finish.
 *
 * Everything that touches the outside world is injected — opening a
 * browser, fetching, the keychain, the data directory — so the
 * orchestration can be tested without Electron, a browser, or a running
 * backend. That matters because the interesting behaviour here is the
 * failure paths, and those are hard to provoke against a real server.
 *
 * The token is held here and never returned to a caller in the renderer.
 * see docs/archive/2026-08-28-electron-sign-in-plan.md
 */
export type AuthDeps = {
    openExternal: (url: string) => Promise<void>;
    fetchImpl: FetchLike;
    safeStorage: SafeStorageLike;
    userDataDir: string;
    env?: Record<string, string | undefined>;
    /**
     * Override the loopback port. Only for tests: the real port is fixed
     * because the backend's redirect allowlist is exact-match, and the
     * live-backend test therefore has to hold 8976. Unit tests use another
     * port so the two cannot race for it under vitest's parallel files.
     */
    loopbackPort?: number;
    /** False in a dev run, which then signs in against localhost. */
    isPackaged?: boolean;
};
export type SignInOutcome = {
    status: 'signed-in';
    user: DesktopUser;
    persisted: boolean;
} | {
    status: 'cancelled';
} | {
    status: 'timeout';
} | {
    status: 'failed';
    message: string;
};
export type AuthStatus = {
    signedIn: boolean;
    user?: DesktopUser;
};
/** Test seam: reset module state between cases. */
export declare const __resetAuthState: () => void;
export declare const signIn: (deps: AuthDeps) => Promise<SignInOutcome>;
/** Abandon a sign-in in progress — the user closed the dialog or gave up. */
export declare const cancelSignIn: () => Promise<void>;
/**
 * Current status, reading the stored token on first call.
 *
 * Deliberately does NOT validate against the server: a signed-out app
 * must cost nothing, and a network round-trip on launch would break that.
 * The first real API call is where an expired token surfaces, as a 401.
 */
export declare const getStatus: (deps: AuthDeps) => Promise<AuthStatus>;
export declare const signOut: (deps: AuthDeps) => Promise<void>;
/** The bearer token for an authenticated request. Main process only. */
export declare const currentAuthToken: () => string | null;
