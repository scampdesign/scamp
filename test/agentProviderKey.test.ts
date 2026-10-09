import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import type { SafeStorageLike } from '../src/main/auth/tokenStore';
import { PROVIDER_KEY_FILE } from '../src/main/agent/config';
import { createProviderKey, type VerifyOutcome } from '../src/main/agent/providerKey';

/**
 * The Scamp Agent's provider key. What matters: it is never written in
 * the clear, never stored unverified, and never handed out to a
 * signed-out user. see docs/plans/builtin-agent-plan.md
 */

const KEY = 'sk-ant-api03-test-key';

/** Reversible, but never leaves the plaintext visible on disk. */
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

const accept = async (): Promise<VerifyOutcome> => ({ ok: true });

let dir: string;
let verified: string[];

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-agent-key-'));
  verified = [];
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const make = (
  over: {
    safeStorage?: SafeStorageLike;
    verify?: (key: string) => Promise<VerifyOutcome>;
    signedIn?: () => boolean;
  } = {}
): ReturnType<typeof createProviderKey> =>
  createProviderKey({
    safeStorage: over.safeStorage ?? workingSafeStorage(),
    userDataDir: dir,
    verify: async (key) => {
      verified.push(key);
      return (over.verify ?? accept)(key);
    },
    isSignedIn: over.signedIn ?? (() => true),
  });

const keyFile = (): string => path.join(dir, PROVIDER_KEY_FILE);

describe('createProviderKey', () => {
  it('starts not connected when nothing is stored', async () => {
    expect(await make().status()).toBe('not-connected');
  });

  it('verifies, stores encrypted, and reports connected', async () => {
    const store = make();
    expect(await store.set(`  ${KEY}\n`)).toEqual({ ok: true, status: 'connected' });
    // Trimmed before checking: a pasted key often carries a newline.
    expect(verified).toEqual([KEY]);
    const onDisk = await fs.readFile(keyFile(), 'utf-8');
    expect(onDisk).not.toContain(KEY);
    expect(await store.current()).toBe(KEY);
  });

  it('reads a stored key back in a new session without re-verifying', async () => {
    await make().set(KEY);
    verified = [];
    const next = make();
    expect(await next.status()).toBe('connected');
    expect(await next.current()).toBe(KEY);
    expect(verified).toEqual([]);
  });

  it('stores nothing when the provider rejects the key', async () => {
    const store = make({
      verify: async () => ({ ok: false, reason: 'invalid-key', message: 'no' }),
    });
    expect(await store.set(KEY)).toEqual({ ok: false, reason: 'invalid-key', message: 'no' });
    await expect(fs.access(keyFile())).rejects.toThrow();
    expect(await store.status()).toBe('not-connected');
  });

  it('keeps an earlier good key when a new one is rejected', async () => {
    let good = true;
    const store = make({
      verify: async () => (good ? { ok: true } : { ok: false, reason: 'invalid-key', message: 'no' }),
    });
    await store.set(KEY);
    good = false;
    await store.set('sk-ant-wrong');
    expect(await store.current()).toBe(KEY);
    expect(await store.status()).toBe('connected');
  });

  it('refuses an empty key without asking the provider', async () => {
    expect(await make().set('   ')).toMatchObject({ ok: false, reason: 'empty' });
    expect(verified).toEqual([]);
  });

  it('refuses a key from a signed-out user without asking the provider', async () => {
    expect(await make({ signedIn: () => false }).set(KEY)).toMatchObject({
      ok: false,
      reason: 'signed-out',
    });
    expect(verified).toEqual([]);
  });

  it('withholds a stored key once the user signs out', async () => {
    let signedIn = true;
    const store = make({ signedIn: () => signedIn });
    await store.set(KEY);
    signedIn = false;
    expect(await store.current()).toBeNull();
  });

  it('holds the key for this session only when the OS cannot encrypt', async () => {
    const store = make({
      safeStorage: { ...workingSafeStorage(), isEncryptionAvailable: () => false },
    });
    expect(await store.set(KEY)).toEqual({ ok: true, status: 'session-only' });
    await expect(fs.access(keyFile())).rejects.toThrow();
    expect(await store.current()).toBe(KEY);
  });

  it('clears the stored key', async () => {
    const store = make();
    await store.set(KEY);
    await store.clear();
    expect(await store.status()).toBe('not-connected');
    expect(await store.current()).toBeNull();
    await expect(fs.access(keyFile())).rejects.toThrow();
  });

  it('removes a key a different keychain wrote, since it can never be read', async () => {
    await fs.writeFile(keyFile(), 'garbage that will not decrypt');
    expect(await make().status()).toBe('not-connected');
    await expect(fs.access(keyFile())).rejects.toThrow();
  });

  it('reports invalid when the provider rejects a stored key mid-session', async () => {
    const store = make();
    await store.set(KEY);
    store.markInvalid();
    expect(await store.status()).toBe('invalid');
  });

  it('does not report invalid when there is no key to be invalid', async () => {
    const store = make();
    store.markInvalid();
    expect(await store.status()).toBe('not-connected');
  });
});
