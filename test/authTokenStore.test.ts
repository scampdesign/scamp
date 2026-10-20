import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import {
  clearToken,
  loadToken,
  saveToken,
  type SafeStorageLike,
} from '../src/main/auth/tokenStore';

/**
 * The behaviour that matters here is what happens when the OS cannot
 * encrypt — a Linux box with no keyring, or a keychain identity that
 * changed between builds. Neither may end with a bearer token readable on
 * disk. see docs/archive/2026-08-28-electron-sign-in-plan.md
 */

/**
 * Stand-in for Electron's safeStorage. The transform is reversible but
 * must NOT leave the plaintext visible — a first version tagged the value
 * (`enc:<token>`) and the "never in the clear" test caught it, which is
 * the test doing its job on the double rather than the code.
 */
const workingSafeStorage = (): SafeStorageLike => ({
  isEncryptionAvailable: () => true,
  encryptString: (plain) =>
    Buffer.from(`enc:${Buffer.from(plain, 'utf-8').toString('base64')}`, 'utf-8'),
  decryptString: (buf) => {
    const raw = buf.toString('utf-8');
    if (!raw.startsWith('enc:')) throw new Error('not ours');
    return Buffer.from(raw.slice(4), 'base64').toString('utf-8');
  },
});

const unavailableSafeStorage = (): SafeStorageLike => ({
  ...workingSafeStorage(),
  isEncryptionAvailable: () => false,
});

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-auth-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('saving a token', () => {
  it('round-trips through the store', async () => {
    const deps = { safeStorage: workingSafeStorage(), userDataDir: dir };
    expect(await saveToken('session-abc', deps)).toEqual({ status: 'saved' });
    expect(await loadToken(deps)).toEqual({ status: 'ok', token: 'session-abc' });
  });

  it('never writes the token in the clear', async () => {
    // The single most important assertion in this file.
    const deps = { safeStorage: workingSafeStorage(), userDataDir: dir };
    await saveToken('session-abc', deps);
    const files = await fs.readdir(dir);
    const contents = await Promise.all(
      files.map((f) => fs.readFile(path.join(dir, f), 'utf-8'))
    );
    expect(contents.join('')).not.toContain('session-abc');
  });

  it('creates the directory if it is missing', async () => {
    const nested = path.join(dir, 'does', 'not', 'exist');
    const deps = { safeStorage: workingSafeStorage(), userDataDir: nested };
    expect(await saveToken('t', deps)).toEqual({ status: 'saved' });
  });

  it('overwrites a previous token rather than appending', async () => {
    const deps = { safeStorage: workingSafeStorage(), userDataDir: dir };
    await saveToken('first', deps);
    await saveToken('second', deps);
    expect(await loadToken(deps)).toEqual({ status: 'ok', token: 'second' });
  });
});

describe('when encryption is unavailable', () => {
  const deps = () => ({ safeStorage: unavailableSafeStorage(), userDataDir: dir });

  it('reports memory-only instead of saving', async () => {
    expect(await saveToken('session-abc', deps())).toEqual({
      status: 'memory-only',
    });
  });

  it('writes nothing at all to disk', async () => {
    // Falling back to a plaintext write is the failure this exists to
    // prevent: a bearer credential readable by anything on the machine.
    await saveToken('session-abc', deps());
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it('reports unavailable on load rather than pretending there is nothing', async () => {
    // Distinct from `none`: the caller can explain why the user is being
    // asked to sign in again.
    expect(await loadToken(deps())).toEqual({ status: 'unavailable' });
  });
});

describe('loading', () => {
  it('reports none when nothing was ever saved', async () => {
    expect(
      await loadToken({ safeStorage: workingSafeStorage(), userDataDir: dir })
    ).toEqual({ status: 'none' });
  });

  it('reports unreadable when the blob cannot be decrypted', async () => {
    // What a changed keychain identity looks like — a re-signed build
    // reading a token the previous one wrote.
    await fs.writeFile(path.join(dir, 'auth-token.bin'), 'from-another-identity');
    expect(
      await loadToken({ safeStorage: workingSafeStorage(), userDataDir: dir })
    ).toEqual({ status: 'unreadable' });
  });

  it('treats an empty decrypt as unreadable', async () => {
    const safeStorage: SafeStorageLike = {
      ...workingSafeStorage(),
      decryptString: () => '',
    };
    await fs.writeFile(path.join(dir, 'auth-token.bin'), 'enc:');
    expect(await loadToken({ safeStorage, userDataDir: dir })).toEqual({
      status: 'unreadable',
    });
  });
});

describe('clearing', () => {
  it('removes a stored token', async () => {
    const deps = { safeStorage: workingSafeStorage(), userDataDir: dir };
    await saveToken('session-abc', deps);
    await clearToken({ userDataDir: dir });
    expect(await loadToken(deps)).toEqual({ status: 'none' });
  });

  it('is a no-op when there is nothing stored', async () => {
    await expect(clearToken({ userDataDir: dir })).resolves.toBeUndefined();
  });
});

describe('a Linux keyring fallback with a fixed key', () => {
  // Electron reports encryption as available, but `basic_text` encrypts
  // with a key anyone can look up. see docs/audits/2026-10-20-repo-audit.md, finding 10
  const basicText = (): SafeStorageLike => ({
    ...workingSafeStorage(),
    getSelectedStorageBackend: () => 'basic_text',
  });

  it('keeps the token in memory only, writing nothing', async () => {
    expect(await saveToken('secret-token', { safeStorage: basicText(), userDataDir: dir })).toEqual({ status: 'memory-only' });
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it('removes a token written under it before, and reads nothing', async () => {
    await saveToken('secret-token', { safeStorage: workingSafeStorage(), userDataDir: dir });
    expect(await loadToken({ safeStorage: basicText(), userDataDir: dir })).toEqual({ status: 'unavailable' });
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it('saves as before with a real keyring', async () => {
    const keyring = { ...workingSafeStorage(), getSelectedStorageBackend: () => 'gnome_libsecret' };
    expect(await saveToken('secret-token', { safeStorage: keyring, userDataDir: dir })).toEqual({ status: 'saved' });
  });
});
