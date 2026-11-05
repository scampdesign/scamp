import type { AppFeatures } from '@shared/types';
import type { FetchLike } from './tokenExchange';
/**
 * Flagged features, as the website decides them for the signed-in account
 * (`GET /api/desktop/features`). Admins get them automatically; an admin
 * switches them on for anyone else.
 *
 * The last answer is kept on disk, so the app works offline as it did when
 * last online. Signed out, or never asked, everything is off. Main is the
 * gate (the embedded window refuses to open without the flag); the
 * renderer only hides the button.
 * see docs/plans/embedded-scamp-plan.md
 */
export declare const NO_FEATURES: AppFeatures;
/** The flags as last known. */
export declare const currentFeatures: () => AppFeatures;
/** A response body as features; anything malformed is all-off. */
export declare const parseFeatures: (text: string) => AppFeatures;
export type FeatureDeps = {
    baseUrl: string;
    fetchImpl: FetchLike;
    token: () => string | null;
    userDataDir: string;
};
/** Read the cached answer at launch. */
export declare const loadFeatures: (userDataDir: string) => Promise<AppFeatures>;
/**
 * Ask the website. Returns the new flags, or null when it couldn't be asked
 * (signed out, offline, server error), in which case the cached flags stand.
 */
export declare const refreshFeatures: (deps: FeatureDeps) => Promise<AppFeatures | null>;
/** Signed out: nothing flagged survives, on disk or in memory. */
export declare const clearFeatures: (userDataDir: string) => Promise<void>;
