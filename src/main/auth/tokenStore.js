import { promises as fs } from 'fs';
import path from 'path';
/**
 * Encryption that actually protects. On a Linux box with no keyring,
 * Electron still reports encryption as available but uses `basic_text`,
 * a fixed key anyone can look up, so that counts as none.
 */
const protects = (safeStorage) => {
    if (!safeStorage.isEncryptionAvailable())
        return false;
    try {
        return safeStorage.getSelectedStorageBackend?.() !== 'basic_text';
    }
    catch {
        // Not on Linux, or not ready to say: the availability check stands.
        return true;
    }
};
const FILE_NAME = 'auth-token.bin';
/**
 * Persist the token, or refuse to.
 *
 * Refusing is a success path, not an error: sign-in still worked, it just
 * will not survive a restart. Writing the token in the clear instead would
 * turn a minor inconvenience into a credential sitting readable on disk.
 */
export const saveToken = (token, deps) => saveSecret(FILE_NAME, token, deps);
/**
 * Persist any secret under `fileName` in userData, with the same refusal
 * as the session token: encrypted, or not at all. The Scamp Agent's
 * provider key uses it too. see docs/archive/2026-10-06-builtin-agent-plan.md
 */
export const saveSecret = async (fileName, secret, { safeStorage, userDataDir }) => {
    if (!protects(safeStorage))
        return { status: 'memory-only' };
    const encrypted = safeStorage.encryptString(secret);
    await fs.mkdir(userDataDir, { recursive: true });
    await fs.writeFile(path.join(userDataDir, fileName), encrypted);
    return { status: 'saved' };
};
/**
 * Read a stored token.
 *
 * `unreadable` is its own outcome rather than an error because it has a
 * mundane cause: the OS keychain identity changed — a re-signed or
 * differently-signed build — so the blob is intact and undecryptable. The
 * caller should clear it and ask the user to sign in again.
 */
export const loadToken = (deps) => loadSecret(FILE_NAME, deps);
/** Read a secret `saveSecret` wrote. `token` holds the secret on `ok`. */
export const loadSecret = async (fileName, { safeStorage, userDataDir }) => {
    if (!safeStorage.isEncryptionAvailable())
        return { status: 'unavailable' };
    if (!protects(safeStorage)) {
        // Written under the fixed key before this check existed: as good as
        // plain text, so it goes rather than staying readable on disk.
        await fs.rm(path.join(userDataDir, fileName), { force: true });
        return { status: 'unavailable' };
    }
    let blob;
    try {
        blob = await fs.readFile(path.join(userDataDir, fileName));
    }
    catch {
        return { status: 'none' };
    }
    try {
        const token = safeStorage.decryptString(blob);
        if (token.length === 0)
            return { status: 'unreadable' };
        return { status: 'ok', token };
    }
    catch {
        return { status: 'unreadable' };
    }
};
/** Remove the stored token. Safe to call when there isn't one. */
export const clearToken = (deps) => clearSecret(FILE_NAME, deps);
/** Remove a stored secret. Safe to call when there isn't one. */
export const clearSecret = async (fileName, { userDataDir }) => {
    await fs.rm(path.join(userDataDir, fileName), { force: true });
};
