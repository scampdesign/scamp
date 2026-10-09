import { create } from 'zustand';
export const useAuthStore = create((set) => ({
    status: 'unknown',
    user: null,
    applyStatus: (result) => set(result.signedIn
        ? { status: 'signed-in', user: result.user ?? null }
        : { status: 'signed-out', user: null }),
}));
/** True only once main has said the user is signed in. */
export const useIsSignedIn = () => useAuthStore((s) => s.status === 'signed-in');
