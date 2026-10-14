import { randomUUID } from 'crypto';

import type { Settings } from '@shared/types';

/**
 * An anonymous, randomly-generated id for this install — the only thing that
 * lets Sentry count *users* rather than *launches*.
 *
 * Deliberately a random UUID and nothing else. Not a machine id, hostname,
 * MAC address, or username: those identify a person or device, persist across
 * reinstalls, and can be correlated with other software on the same machine.
 * A random UUID answers "how many installs were active today" and supports no
 * other question.
 *
 * It rides only on Sentry's session envelope. Crash reports stay unlinked
 * from it — `beforeSend` in `sentry.ts` deletes `event.user`.
 * see docs/archive/2026-08-11-dau-tracking-plan.md
 */

/** A v4 UUID as `crypto.randomUUID` produces it. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidInstallId = (value: unknown): value is string =>
  typeof value === 'string' && UUID_V4.test(value);

export type InstallIdResult = {
  installId: string;
  /** True when this call minted a new one, so the caller knows to persist. */
  created: boolean;
};

/**
 * The install id from settings, generating one if absent or malformed.
 *
 * Pure — takes settings in, hands an id back, and reports whether it made
 * one. Persisting is the caller's job, which keeps this testable without
 * touching Electron's userData path.
 */
export const resolveInstallId = (settings: Settings): InstallIdResult => {
  if (isValidInstallId(settings.installId)) {
    return { installId: settings.installId, created: false };
  }
  return { installId: randomUUID(), created: true };
};

/**
 * The id to use given the user's consent — `null` when they haven't opted in
 * under the current wording.
 *
 * Returning null (rather than generating one anyway) is what makes opting out
 * actually sever the link: the caller clears the stored value, so opting back
 * in later mints a fresh id rather than rejoining the old identity.
 */
export const installIdForConsent = (
  settings: Settings,
  optedIn: boolean
): InstallIdResult | null => (optedIn ? resolveInstallId(settings) : null);
