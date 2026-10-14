import { it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { signIn, __resetAuthState, currentAuthToken } from '../../src/main/auth/authService';
import type { SafeStorageLike } from '../../src/main/auth/tokenStore';

/**
 * The one test that proves the flow against a REAL backend rather than
 * against our own reading of its contract.
 *
 * Everything else in the auth suite is checked with injected doubles, and
 * doubles agree with whatever we believed when we wrote them. This drives
 * the actual endpoints: authorize, the loopback callback, and the token
 * exchange including the `origin` header the backend requires.
 *
 * SKIPS when the backend is not running, so it never fails CI or a
 * machine without it. Start it with `npm run dev` in the scamp-website
 * repo, then run this. see docs/archive/2026-08-28-electron-sign-in-plan.md
 */
const BASE = process.env['SCAMP_AUTH_BASE_URL'] ?? 'http://localhost:3000';
let backendUp = false;

beforeAll(async () => {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(2000) });
    backendUp = res.ok;
  } catch {
    backendUp = false;
  }
});
const safeStorage: SafeStorageLike = {
  isEncryptionAvailable: () => true,
  encryptString: (p) => Buffer.from(`enc:${Buffer.from(p).toString('base64')}`),
  decryptString: (b) => Buffer.from(b.toString().slice(4), 'base64').toString(),
};

it('signs in against the real local backend', async (ctx) => {
  if (!backendUp) {
    ctx.skip();
    return;
  }
  __resetAuthState();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-live-'));
  const email = `desktop-live-${Date.now()}@example.com`;

  // Sign up over HTTP to get a browser-equivalent session cookie.
  const signUp = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ email, password: 'test-password-123', name: 'Live Tester' }),
  });
  const cookie = signUp.headers.get('set-cookie') ?? '';

  const result = await signIn({
    // Stand in for the browser: take the URL our code built, authorize
    // with the session, then hit our own loopback listener.
    openExternal: async (url) => {
      const u = new URL(url);
      const res = await fetch(`${BASE}/api/desktop/authorize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE, cookie },
        body: JSON.stringify({
          redirectUri: u.searchParams.get('redirect_uri'),
          state: u.searchParams.get('state'),
          codeChallenge: u.searchParams.get('code_challenge'),
          codeChallengeMethod: u.searchParams.get('code_challenge_method'),
        }),
      });
      const body = await res.json().catch(() => ({}));
      await fetch((body as Record<string, string>)['callbackUrl'] ?? '');
    },
    fetchImpl: async (url, init) => {
      const res = await fetch(url, init);
      return { ok: res.ok, status: res.status, text: () => res.text() };
    },
    safeStorage,
    userDataDir: dir,
    env: { SCAMP_AUTH_BASE_URL: BASE },
  });

  const files = await fs.readdir(dir);
  await fs.rm(dir, { recursive: true, force: true });

  expect(signUp.status).toBe(200);
  expect(result.status).toBe('signed-in');
  if (result.status !== 'signed-in') return;
  expect(result.user.email).toBe(email);
  expect(result.persisted).toBe(true);
  // Held in the main process, and encrypted on disk — never returned to
  // a caller and never written in the clear.
  expect(currentAuthToken()).not.toBeNull();
  expect(files).toEqual(['auth-token.bin']);
}, 60000);
