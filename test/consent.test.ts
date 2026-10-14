import { describe, expect, it } from 'vitest';

import { CONSENT_VERSION, hasCurrentConsent, isOptedIn } from '@shared/consent';
import { DEFAULT_SETTINGS, parseSettingsBlob } from '../src/main/ipc/settingsOps';
import type { Settings } from '@shared/types';

/**
 * Consent versioning. The rule these pin: an opt-in recorded against older
 * wording must NOT carry forward, because the user was never shown what we
 * now send.
 * see docs/archive/2026-08-11-dau-tracking-plan.md
 */

const settings = (over: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  ...over,
});

describe('hasCurrentConsent', () => {
  it('is false on a fresh install', () => {
    expect(hasCurrentConsent(settings())).toBe(false);
  });

  it('is false for a decision made against older wording', () => {
    // The case that matters: someone said yes to crash-reports-only.
    expect(
      hasCurrentConsent(settings({ sentryOptIn: true, consentVersion: 0 }))
    ).toBe(false);
  });

  it('is true once answered against the current wording', () => {
    expect(
      hasCurrentConsent(
        settings({ sentryOptIn: true, consentVersion: CONSENT_VERSION })
      )
    ).toBe(true);
  });

  it('counts an explicit NO as answered', () => {
    // A decline still resolves the prompt — we mustn't nag.
    expect(
      hasCurrentConsent(
        settings({ sentryOptIn: false, consentVersion: CONSENT_VERSION })
      )
    ).toBe(true);
  });

  it('accepts a future version, so a downgrade does not re-prompt', () => {
    expect(
      hasCurrentConsent(
        settings({ sentryOptIn: true, consentVersion: CONSENT_VERSION + 1 })
      )
    ).toBe(true);
  });
});

describe('isOptedIn', () => {
  it('is false for a stale opt-in', () => {
    // The guarantee: nothing is sent under an old agreement.
    expect(isOptedIn(settings({ sentryOptIn: true, consentVersion: 0 }))).toBe(
      false
    );
  });

  it('is true for a current opt-in', () => {
    expect(
      isOptedIn(settings({ sentryOptIn: true, consentVersion: CONSENT_VERSION }))
    ).toBe(true);
  });

  it('is false for a current opt-out', () => {
    expect(
      isOptedIn(settings({ sentryOptIn: false, consentVersion: CONSENT_VERSION }))
    ).toBe(false);
  });

  it('is false on a fresh install', () => {
    expect(isOptedIn(settings())).toBe(false);
  });
});

describe('parseSettingsBlob — consent fields', () => {
  it('treats a settings file with no consentVersion as version 0', () => {
    // Every install that predates this change lands here, and so gets
    // re-prompted.
    const parsed = parseSettingsBlob(JSON.stringify({ sentryOptIn: true }));
    expect(parsed.consentVersion).toBe(0);
    expect(isOptedIn(parsed)).toBe(false);
  });

  it('round-trips a current consent', () => {
    const parsed = parseSettingsBlob(
      JSON.stringify({ sentryOptIn: true, consentVersion: CONSENT_VERSION })
    );
    expect(isOptedIn(parsed)).toBe(true);
  });

  it('reads a stored install id', () => {
    const id = 'f81d4fae-7dec-41d0-9765-00a0c91e6bf6';
    expect(parseSettingsBlob(JSON.stringify({ installId: id })).installId).toBe(
      id
    );
  });

  it('nulls a non-string or empty install id', () => {
    expect(parseSettingsBlob(JSON.stringify({ installId: 42 })).installId).toBeNull();
    expect(parseSettingsBlob(JSON.stringify({ installId: '' })).installId).toBeNull();
  });

  it('defaults both fields on a malformed file', () => {
    const parsed = parseSettingsBlob('null');
    expect(parsed.consentVersion).toBe(0);
    expect(parsed.installId).toBeNull();
  });
});
