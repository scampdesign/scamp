import { promises as fs } from 'fs';
import { join } from 'path';

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

export const NO_FEATURES: AppFeatures = { embedded: false };

const FILE = 'features.json';

let current: AppFeatures = NO_FEATURES;

/** The flags as last known. */
export const currentFeatures = (): AppFeatures => current;

/** A response body as features; anything malformed is all-off. */
export const parseFeatures = (text: string): AppFeatures => {
  try {
    const body = JSON.parse(text) as unknown;
    return { embedded: typeof body === 'object' && body !== null && (body as { embedded?: unknown }).embedded === true };
  } catch {
    return NO_FEATURES;
  }
};

export type FeatureDeps = {
  baseUrl: string;
  fetchImpl: FetchLike;
  token: () => string | null;
  userDataDir: string;
};

/** Read the cached answer at launch. */
export const loadFeatures = async (userDataDir: string): Promise<AppFeatures> => {
  try {
    current = parseFeatures(await fs.readFile(join(userDataDir, FILE), 'utf8'));
  } catch {
    current = NO_FEATURES;
  }
  return current;
};

/**
 * Ask the website. Returns the new flags, or null when it couldn't be asked
 * (signed out, offline, server error), in which case the cached flags stand.
 */
export const refreshFeatures = async (deps: FeatureDeps): Promise<AppFeatures | null> => {
  const token = deps.token();
  if (token === null || token.length === 0) return null;
  try {
    const res = await deps.fetchImpl(new URL('/api/desktop/features', deps.baseUrl).toString(), {
      method: 'GET',
      headers: { authorization: `Bearer ${token}`, origin: new URL(deps.baseUrl).origin },
    });
    if (!res.ok) return null;
    current = parseFeatures(await res.text());
    await fs.writeFile(join(deps.userDataDir, FILE), JSON.stringify(current), 'utf8').catch(() => undefined);
    return current;
  } catch {
    return null;
  }
};

/** Signed out: nothing flagged survives, on disk or in memory. */
export const clearFeatures = async (userDataDir: string): Promise<void> => {
  current = NO_FEATURES;
  await fs.rm(join(userDataDir, FILE), { force: true });
};
