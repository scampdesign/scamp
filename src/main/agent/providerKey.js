import { clearSecret, loadSecret, saveSecret, } from '../auth/tokenStore';
import { PROVIDER_KEY_FILE } from './config';
export const createProviderKey = (deps) => {
    let key = null;
    let status = 'not-connected';
    let loaded = null;
    // Read once, lazily. A stored key is trusted until the provider says
    // otherwise: checking it at every launch would spend a request on every
    // start of an app most sessions never ask the agent anything in.
    const ensureLoaded = () => {
        loaded ??= (async () => {
            const found = await loadSecret(PROVIDER_KEY_FILE, deps);
            if (found.status === 'ok') {
                key = found.token;
                status = 'connected';
            }
            else if (found.status === 'unreadable') {
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
            if (!verdict.ok)
                return verdict;
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
            if (key !== null)
                status = 'invalid';
        },
    };
};
