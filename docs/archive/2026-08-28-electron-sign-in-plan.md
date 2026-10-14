# Sign in to a Scamp account from the app — Plan

Status: **ready to build.** Backend contract published and running
locally; see `## The backend contract` below for what changed. Backlog
v11, story 1.

## Context

Scamp works fully offline and should keep doing so. This adds an
opt-in account: a "Sign in" button in the toolbar, a browser round-trip
to the existing Better Auth backend, and a token stored in the OS
keychain. Cloud sync (story 2) depends on it; nothing else does.

The governing constraint is that **the signed-out app must not get
worse**. No blocking prompts, no network calls on launch for a user who
never signs in, no failure mode where a broken keychain stops someone
drawing rectangles.

---

## What already exists

Very little of this, which is worth knowing up front:

- **No protocol registration.** `setAsDefaultProtocolClient` appears
  nowhere, and `electron-builder.yml` has no `protocols` entry.
- **No single-instance lock.** `main/index.ts` never calls
  `requestSingleInstanceLock`. This matters more than it looks — see
  decision 2.
- **No `safeStorage` usage** anywhere in the codebase.
- **Settings persistence does exist** (`settingsOps.ts`,
  `DEFAULT_SETTINGS` + `parseSettingsBlob`), so there is a pattern for
  main-side JSON state, and `installId` shows the shape for a per-install
  identifier.
- **The IPC conventions are well established** — channel constants in
  `shared/ipcChannels.ts`, one handler file per domain in `main/ipc/`,
  payload types in `shared/types.ts`.

---

## Decisions

### 1. The token never touches the renderer

The renderer gets `{ signedIn, user }` and nothing else. The JWT lives in
the main process, is written through `safeStorage`, and is attached to
outbound requests by main-side code.

This is the difference between "a token in an encrypted store" and "a
token in an encrypted store that is also in a web page's memory". Story 2
will want to send authenticated requests; those should be main-side IPC
handlers, not `fetch` from the renderer with a token it was handed.

### 2. The callback needs a single-instance lock, and this is the part that usually breaks

On macOS a `scamp://` callback fires `open-url` on the running app. On
**Windows and Linux it launches a second copy of the app**, with the URL
in `process.argv`. Without `requestSingleInstanceLock()` plus a
`second-instance` handler, that second copy takes the token, does nothing
visible with it, and exits — the original window sits there still signed
out, with no error anywhere.

So this feature requires adding a single-instance lock to an app that has
never had one. That is a behaviour change in its own right (a second
launch now focuses the existing window rather than opening another), and
it should be verified on Windows and Linux specifically.

Handled in three places:

- `open-url` — macOS, app running or cold
- `second-instance` — Windows/Linux, app already running
- `process.argv` at startup — Windows/Linux, cold start from the link

### 3. PKCE — the callback carries a code, not a token

Superseded and improved on by the backend. My original decision was a
`state` nonce, on the reasoning that any app can claim `scamp://`. That
reasoning was right and the mitigation was insufficient: `state` proves
the callback belongs to a request we made, not that only we can use it.
An interceptor that reads the callback still gets a token.

The backend therefore puts a **code** on the callback, redeemable only
with a verifier that never leaves the app:

```
verifier  = random 43-128 chars, in memory only
challenge = base64url(sha256(verifier))
→ /sign-in?...&code_challenge=<challenge>&code_challenge_method=S256
← scamp://auth/callback?code=…&state=…
→ POST /api/desktop/token { code, codeVerifier }
← { token, user }
```

`state` is still generated and still checked — it is required to be
8–256 chars and echoed verbatim — but it is no longer load-bearing on its
own. An intercepted callback yields something unspendable.

The backend's own checks assert the properties we care about: the
callback carries no token, a different verifier cannot redeem, the
challenge cannot be replayed as the verifier, a wrong guess burns the
code, and a code cannot be redeemed twice.

### 4. Refuse to store rather than store in plaintext

`safeStorage.isEncryptionAvailable()` returns false on a Linux box with
no keyring (and can on a misconfigured macOS keychain). Electron's
`encryptString` will still "work" there in some builds by falling back to
plaintext, which is exactly what the story says must not happen.

If encryption is unavailable: sign-in still completes for the session,
the token is held in memory only, and the user is told they will need to
sign in again next launch. Never a silent plaintext write.

### 5. Loopback redirect first, custom scheme as fallback

The backend allowlists `http://localhost:8976/callback` and
`http://127.0.0.1:8976/callback` alongside `scamp://auth/callback`. That
is worth taking, and not only for development.

A loopback listener means the app opens a browser, the browser redirects
to a local HTTP server the app is running, and the app reads the code
directly. **No OS protocol registration, no URL interception, no
platform-specific entry points, no reliance on which app last claimed
`scamp://`.** It is also what RFC 8252 (OAuth for native apps)
recommends over custom schemes, for exactly the hijacking reason in
decision 3.

Concretely it removes most of the risk in this story:

| | custom scheme | loopback |
|---|---|---|
| OS registration | required, per platform | none |
| Callback entry points | three (`open-url`, `second-instance`, `argv`) | one |
| Single-instance lock | required | not required for auth |
| Can another app intercept? | yes, last registrant wins | no, we hold the socket |
| Manual cross-platform testing | the whole of item 6 | much less |

**One constraint that shapes this:** the allowlist is exact-match with no
wildcard, so the port is fixed at 8976. If something else holds it, we
cannot fall back to a random port — so the plan is loopback first, and
the `scamp://` scheme as the fallback when the port is unavailable. That
keeps the scheme work in the story but demotes it from "the mechanism" to
"the contingency", and it can land after a working loopback flow rather
than before.

The single-instance lock stays regardless, because focusing an existing
window is the behaviour you confirmed you want — it is just no longer
load-bearing for auth.

### 6. Sessions expire on inactivity, not on a clock

Confirmed by the backend, and it is the sliding window I described —
with one simplification: **there is no separate refresh token.**

`/api/desktop/token` returns an opaque **Better Auth session token**, not
a JWT. Default expiry is 30 days, refreshed on use. A token used
regularly keeps working; one left unused past expiry stops.

So the app does not implement refresh at all. It sends the token, and
treats a `401` as "signed out — sign in again". That is less code than
the access/refresh pair I originally sketched, and it removes a whole
class of token-lifecycle bugs.

The opaque choice also buys immediate revocation: signing out on the web
or deleting the session row kills the desktop token at once, because
every request hits the database anyway. Worth knowing for a future "sign
out everywhere".

The user object returned alongside (`id`, `name`, `email`,
`emailVerified`) is **display data only**. The app shows it and never
treats it as authority; the server re-checks every request.

### 7. Signed-out is the default and costs nothing### 6. Signed-out is the default and costs nothing

No token file, no keychain read, no network on launch until the user
clicks Sign in. `auth:status` answers from memory after a single lazy
read on first request.

---

## Phases

**Phase 1 — the plumbing, no UI.** Protocol registration, the
single-instance lock, the three callback entry points, state generation
and validation, `safeStorage` read/write with the unavailable path. IPC
channels and types. Testable end to end by invoking the URL by hand
before any button exists.

**Phase 2 — token lifecycle.** Validate against the cloud API on first
use, silent refresh, expiry handling, sign-out clearing both the store
and memory.

**Phase 3 — UI.** Sign-in lives on the **start screen**, before a project
is opened — not in the project toolbar as the backlog story describes.
That is a deliberate departure and a better fit: signing in is an
account-level act, not a per-project one, and the start screen is where a
user already is when they are not mid-task. The signed-in identity
(avatar, name, sign-out, tier) belongs there too.

The project toolbar therefore gets nothing in this story. If a cloud
feature later needs per-project affordance — a sync toggle, story 2 —
that is its own decision.

Phase 1 is the risky part and the part worth reviewing closely; 3 is
mostly presentation.

---

## Files to touch

**New:** `src/main/auth/protocol.ts` (registration + the three entry
points), `src/main/auth/tokenStore.ts` (safeStorage wrapper),
`src/main/auth/state.ts` (nonce generation/validation, pure),
`src/main/ipc/auth.ts` (handlers),
`src/renderer/src/components/projectShell/AccountButton.tsx`,
`test/authState.test.ts`, `test/authTokenStore.test.ts`,
`test/e2e/auth/sign-in.spec.ts`.

**Modified:** `src/main/index.ts` (single-instance lock, protocol
handlers — the only invasive edit), `src/shared/ipcChannels.ts`,
`src/shared/types.ts`, `src/preload/index.ts`, `ProjectHeader.tsx`,
`electron-builder.yml` (`protocols` entry), `docs/user_docs/`,
`docs/CHANGELOG.md`.

## Tests

Pure and testable: state nonce generation and matching (including the
rejection cases), callback URL parsing (missing token, missing state,
wrong state, extra params, malformed URL), and the token store's
behaviour when encryption is unavailable.

Not unit-testable and needs manual verification: the OS actually routing
`scamp://` to the app. That is the part most likely to be wrong and least
likely to be caught by a test — see below.

An e2e can cover everything after the callback by invoking the handler
directly with a synthetic URL, which is worth having, but it does **not**
prove the OS registration works.

---

## The backend contract

Published and running locally on the `backend-setup` branch. Not
deployed — production needs a deploy before a release build can sign in.

- **Redirect allowlist** — `scamp://auth/callback`,
  `http://localhost:8976/callback`, `http://127.0.0.1:8976/callback`.
  Exact match, no wildcard.
- **PKCE** — S256, verifier 43–128 chars. See decision 3.
- **`state`** — echoed verbatim, must be 8–256 chars.
- **Token** — opaque Better Auth session token, 30 days, refreshed on
  use, no refresh token. `401` means sign in again.
- **Base URL** — `SCAMP_AUTH_BASE_URL`, defaulting to
  `https://www.scamp.club`; local dev points at `http://localhost:3000`.
- **Reference implementation** — `scripts/check-desktop-auth.mjs` in the
  backend repo drives the whole flow in ~80 lines of Node. Worth reading
  before writing our version, and worth mirroring its assertions in our
  own tests.

## Things I still need from you

Items 1–4 of the original list are answered by the contract above. What
is left:

1. **Deploy the backend** before a release build ships. Local-only is
   fine for building and testing; a signed release that opens
   `scamp.club/sign-in` will fail until it is live.

   **Done — verified 2026-08-28.** `www.scamp.club` is canonical (both
   `scamp.club` and `scampdesign.app` 301 to it, so
   `DEFAULT_AUTH_BASE_URL` is right). `GET /api/desktop/token` returns 405
   and `POST /api/desktop/heartbeat` without a token returns 401 — both
   routes exist in production. What is NOT verified from outside: that the
   production redirect allowlist contains
   `http://localhost:8976/callback` verbatim, and that its trusted origins
   include `https://www.scamp.club` with the `www`. Both are exact-match
   checks that fail closed.

2. **macOS signing.** Unchanged and still ours to confirm: `safeStorage`
   uses the Keychain, and an unsigned or ad-hoc-signed build gets a
   different keychain identity, so a token stored by one build may not be
   readable by the next.

3. **Cross-platform verification — much smaller now.** Taking the
   loopback path (decision 5), there is no OS routing to test. What
   remains is confirming the browser hands back to the app on each
   platform, and that port 8976 is usable. The `scamp://` fallback still
   needs the full closed/already-running matrix on Windows and Linux,
   but only when we build it.

4. **Activity reporting.** Added after the original checklist: the app
   sends `POST /api/desktop/heartbeat` on launch, on sign-in, and every
   four hours, so desktop usage reaches DAU/MAU at all. A 401 from it now
   signs the user out locally — that is where an expired session
   surfaces, since it is the only API call the app makes between sign-in
   and cloud sync. see docs/notes/desktop-heartbeat.md

**No secrets ship in the app.** PKCE exists precisely so a public client
needs none, and the verifier is generated per attempt and never stored.

## Not doing yet: the device authorization flow

The backend offers it as an alternative that removes OS routing
completely — the app shows a short code, the user types it on the web,
the app polls. It is the right answer if the `scamp://` path proves
painful.

I would not reach for it now, because **the loopback redirect already
removes the OS routing problem** at a lower UX cost: the browser bounces
back automatically instead of asking someone to retype a code. Device
flow is the better fallback than `scamp://` if loopback turns out to be
blocked — worth remembering it exists rather than building it.

## Open questions

1. **Where does the account UI live?** The toolbar button is specified;
   the account panel less so. Settings has a natural home for it — or is
   it a popover from the avatar? I lean a popover for identity plus a
   Settings row for the detail.
   the sign in should be on the main page of the app before a project is opened
2. **What happens to an expired session mid-use?** Silently re-auth in
   the background if possible, or a passive "signed out" state the user
   notices when they next use a cloud feature? I lean passive — a modal
   interrupting someone's work fails the "never intrusive" rule.
   is there a way for app users to not have expired sessions or just very long sessions that only expired when theres a period of inactivity?
3. **Should sign-in be per-install or per-project?** Per-install is
   implied and is what I'd build, but story 2 syncs *projects*, so it's
   worth confirming one account per machine is the model. per install
4. **Does the single-instance lock need a carve-out?** Answered: no
   carve-out, and both instances should be signed in.

   Worth naming a tension in that pair. A single-instance lock means a
   second launch **focuses the existing window instead of starting a
   second copy** — so under it, two instances cannot exist, and "signed
   in on both" is satisfied trivially because there is only ever one.

   If genuinely running two copies at once matters, the lock cannot be a
   hard lock, and the Windows/Linux callback problem in decision 2 comes
   back — the second copy would receive the token and the first would
   never learn about it. Solvable (the copies would need to share auth
   state through a file watcher or a local socket) but materially more
   work.

   **Confirmed: windows, not OS processes.** A hard single-instance lock
   is correct — a second launch focuses the existing window, and the
   callback always reaches the one running app. No shared-auth-state
   machinery is needed, and decision 2 stands as written.
