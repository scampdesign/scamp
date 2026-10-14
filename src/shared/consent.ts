import type { Settings } from './types';

/**
 * What the user agreed to, and whether their stored answer still matches
 * what Scamp actually sends.
 *
 * Shared because both sides need it: main decides whether to enable Sentry
 * and attach the install id, the renderer decides whether to show the
 * first-launch prompt. Two copies of this rule would eventually disagree,
 * and the failure mode is sending data the user didn't agree to.
 * see docs/archive/2026-08-11-dau-tracking-plan.md
 */

/**
 * Current version of the crash-reporting / usage consent wording.
 *
 * Bump this whenever what Scamp sends materially changes. A stored
 * `sentryOptIn` carrying an older version is treated as undecided, so the
 * user is asked again against wording that matches reality.
 *
 * 1 — anonymous crash reports plus an anonymous count of app launches.
 *     (Version 0 / missing = the older crash-reports-only wording, which
 *     didn't mention that a session is sent on every launch.)
 */
export const CONSENT_VERSION = 1;

/**
 * Has the user answered the CURRENT wording?
 *
 * A decision made against older wording doesn't count — that's the whole
 * point of versioning it.
 */
export const hasCurrentConsent = (settings: Settings): boolean =>
  settings.sentryOptIn !== null && settings.consentVersion >= CONSENT_VERSION;

/** True only when the user opted IN under the current wording. */
export const isOptedIn = (settings: Settings): boolean =>
  settings.sentryOptIn === true && settings.consentVersion >= CONSENT_VERSION;
