---
title: Desktop activity heartbeat
related:
  - src/main/auth/heartbeat.ts
  - src/main/ipc/auth.ts
  - src/main/index.ts
---

# Desktop activity heartbeat

`POST /api/desktop/heartbeat` with the bearer token, no body, 204 back.
Once on launch, then every four hours while the app runs.

## Why it exists

The app was invisible to the product's active-user numbers. Only page
routes wrote an activity timestamp and the app never renders a page, so
someone who signed in and then used Scamp daily for a month registered as
a single active day. Authenticated API calls now record activity too, but
until cloud sync ships the app makes almost none — it talks to the API at
sign-in and then essentially never again. The heartbeat measures the thing
actually meant: the app was open.

## Cadence

Four hours. The server throttles the write to five minutes, so anything
more frequent buys nothing.

The timer counts elapsed process time, not wall clock, so a laptop asleep
for six hours beats on wake rather than on a schedule. That is the right
shape for "the app was open".

There is also a `MIN_SEND_GAP_MS` floor of one minute between sends from a
single process, because launch plus an immediate sign-in would otherwise
fire twice within seconds. Harmless given the server throttle, but there is
no reason to make the request.

## The rules it obeys

**A signed-out app costs nothing.** No token, no request — the same rule
that keeps `getStatus` off the network at launch. `registerAuthIpc` reads
the stored token first (a file read, no network) and only then starts
beating.

**Activity reporting never breaks anything.** Every failure is swallowed
and unlogged; a heartbeat that cannot reach the server is not worth a line
in the log every four hours.

**A 401 signs the user out locally.** This is now the first real API call
the app makes, so it is where an expired or revoked session surfaces — as
the sign-in plan anticipated, just sooner than expected. Without it the UI
would keep claiming the user is signed in until they restarted.

**A network failure does NOT sign the user out.** Offline is not signed
out. Clearing a valid token because a café wifi portal ate the request
would be a real bug, and it is covered by a test that would otherwise pass
either way.

## When it fires

- **Launch** — after the stored token is read, in `registerAuthIpc`.
- **Sign-in** — immediately, so a new user registers as having used the
  app rather than waiting up to four hours.
- **Every four hours** thereafter, until `disposeAuth()` at shutdown.

The interval is `unref`ed, so it never holds the process open at quit;
stopping it is tidiness rather than a requirement.

Each accepted beat also calls `afterBeat`, which refreshes the account's
feature flags (`GET /api/desktop/features`, see `src/main/auth/features.ts`).
Sign-in refreshes them directly, since the beat skips a send within a
minute of the launch one.

## Reading the numbers

App figures only count builds new enough to send this, so they read low
until the version is widely installed. An early flat line is the rollout,
not the truth.
