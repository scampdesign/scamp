import type {
  AgentKeyRejection,
  AgentKeySetResult,
  AgentKeyStatus,
} from '@shared/types';

import {
  clearSecret,
  loadSecret,
  saveSecret,
  type TokenStoreDeps,
} from '../auth/tokenStore';
import { PROVIDER_KEY_FILE } from './config';

/**
 * The user's own provider key: held in main, stored encrypted, never
 * handed to the renderer.
 *
 * Everything with a side effect is injected — storage, the provider check,
 * whether the user is signed in — so this runs in a unit test with no
 * Electron and no network.
 * see docs/plans/builtin-agent-plan.md
 */

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: AgentKeyRejection; message: string };

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

export const createProviderKey = (deps: ProviderKeyDeps): ProviderKey => {
  let key: string | null = null;
  let status: AgentKeyStatus = 'not-connected';
  let loaded: Promise<void> | null = null;

  // Read once, lazily. A stored key is trusted until the provider says
  // otherwise: checking it at every launch would spend a request on every
  // start of an app most sessions never ask the agent anything in.
  const ensureLoaded = (): Promise<void> => {
    loaded ??= (async () => {
      const found = await loadSecret(PROVIDER_KEY_FILE, deps);
      if (found.status === 'ok') {
        key = found.token;
        status = 'connected';
      } else if (found.status === 'unreadable') {
        // A different keychain identity wrote it. It can never be read,
        // so it is only clutter — and asking again is the honest answer.
        await clearSecret(PROVIDER_KEY_FILE, deps);
      }
    })();
    return loaded;
  };

  return {
    status: async () => {
      await ensureLoaded();
      return status;
    },

    set: async (raw) => {
      if (!deps.isSignedIn()) {
        return { ok: false, reason: 'signed-out', message: 'Sign in to Scamp to connect an AI provider.' };
      }
      const candidate = raw.trim();
      if (candidate.length === 0) {
        return { ok: false, reason: 'empty', message: 'Paste an API key first.' };
      }
      await ensureLoaded();
      const verdict = await deps.verify(candidate);
      if (!verdict.ok) return verdict;
      const saved = await saveSecret(PROVIDER_KEY_FILE, candidate, deps);
      key = candidate;
      status = saved.status === 'saved' ? 'connected' : 'session-only';
      return { ok: true, status };
    },

    clear: async () => {
      await ensureLoaded();
      await clearSecret(PROVIDER_KEY_FILE, deps);
      key = null;
      status = 'not-connected';
    },

    current: async () => {
      await ensureLoaded();
      return deps.isSignedIn() ? key : null;
    },

    markInvalid: () => {
      if (key !== null) status = 'invalid';
    },
  };
};
