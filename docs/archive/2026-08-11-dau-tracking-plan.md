# Daily active users via Sentry — Plan

Status: **implemented** — Phases 0–3 done; Phase 4 is manual verification against a real DSN.
Touches: `src/main/sentry.ts`, `src/main/ipc/settings*.ts`,
`src/shared/types.ts`, `src/renderer/src/components/SentryOptInPrompt.tsx`,
`SettingsPage.tsx`.

## Context

We want a count of daily active users, with no personal information
collected. Sentry is already wired up for crash reporting, so the question is
what to add — and, it turns out, what is already being sent.

---

## Two findings that change the shape of this

### 1. Sessions are already being transmitted — CONFIRMED in Phase 0

`@sentry/electron`'s `mainProcessSessionIntegration()` is in the SDK's
**default** integration list (`main/sdk.js:42`), and `initSentryIfOptedIn`
never overrides `integrations`. So every opted-in launch already sends a
session envelope today.

**Phase 0 result:** sessions are visible in Release Health, but can't be
filtered to unique users. That is exactly the predicted symptom — sessions
are arriving with no distinct id (`did`), so Sentry has nothing to dedupe
them by. Setting the user id is the whole remaining job.

### 2. The consent doesn't cover this, and doesn't today either

The first-launch prompt says:

> "Send anonymous crash reports **when something goes wrong**. No personal
> data, no project files, no file contents — only **error details** and your
> OS and app version."

The button reads **"Send crash reports"**; Settings says "Send anonymous crash
reports".

Sessions are sent on every launch, whether or not anything went wrong — so the
current wording already under-describes what ships, and DAU tracking would
widen that gap further. **This needs fixing regardless of whether we build
the rest of this.** It's the one item in this plan I'd treat as
non-negotiable.

A third check came back clean, for the record: `screenshotsIntegration()` is
also a default, but it's gated on an `attachScreenshot` option we don't set —
no screenshots are attached.

---

## About Sentry's "add spans instrumentation" advice

Sentry's assistant suggested instrumenting spans, noting the widgets it built
were *sourced from error events*. Two things to untangle there:

**It's right about the problem.** A DAU widget built on the **errors** dataset
counts users who hit an error — not active users. That number would be wrong
in a way that looks plausible, which is the worst kind of wrong.

**Spans are one fix, but the heavy one.** It would mean turning on tracing,
sending a span per launch with a user attribute, and paying span quota — to
answer "how many people opened the app". Session data already answers that and
is already being sent.

**The catch is which dataset the dashboard reads.** Session/Release Health
data doesn't live in the errors or spans datasets, so a widget over either
will never see it. Confirm Dashboards can add a widget on the **sessions /
releases** dataset with `count_unique(user)`. If it can't, Release Health's
own per-release view still shows users and is enough for a trend — the
number just lives there rather than on a custom dashboard.

Only reach for spans if a custom dashboard turns out to be a hard requirement
*and* the sessions dataset isn't available to it.

## Decision 1: Release Health sessions, not custom events

Sentry's Release Health is the mechanism designed for this: sessions carry a
distinct id, and `count_unique(user)` over sessions in a day *is* DAU. It's
already half-working, needs no new event volume, and doesn't consume error
quota.

Rejected:
- **A custom "app opened" event per launch.** Burns error quota, pollutes the
  Issues stream, and needs its own dashboard. Strictly worse.
- **Sentry Metrics.** The metrics product has changed shape more than once and
  I can't confirm its current status from here — not something to build a
  measurement pipeline on without checking first.
- **Tracing / transactions.** Heavier, quota cost, and answers a different
  question.

## Decision 2: a random install id, generated locally

Sessions get their distinct id (`did`) from the scope's user, so DAU needs
`Sentry.setUser({ id })`.

**The id must be a random UUID v4, generated once and stored locally.**
Explicitly *not* derived from machine id, hostname, MAC address, or username:
those are stable identifiers with real re-identification value and can be
correlated across applications. A random UUID answers "how many installs were
active today" and nothing else.

**Ordering is safe, which was the main implementation risk.**
`mainProcessSessionIntegration` starts the session during `Sentry.init`, so
the obvious worry is that a `setUser` afterwards arrives too late. It doesn't:
`Scope.setUser` calls `updateSession(this._session, { user })`
(`@sentry/core/build/cjs/scope.js:193`), so setting the user after init
back-fills `did` on the live session. No need to disable the default
integration or restart the session.

Properties to build in:
- Generated on first need, persisted in `settings.json` beside `sentryOptIn`.
- **Regenerated when the user opts out and back in** — so opting out actually
  severs the link rather than pausing it.
- Never sent as `username`, `email`, or `ip_address` — `id` only.

Known limitation to document rather than solve: reinstalling, or clearing app
data, produces a new id and a small overcount. Fine for a usage trend.

## Decision 3: count sessions in main only

The renderer also calls `Sentry.init` (`renderer/src/main.tsx:35`) for
renderer-side crash capture. If both processes track sessions, every launch
counts twice.

**Verify before relying on any number** whether the renderer SDK starts its
own session, and if so disable it there. This is the single most likely way
for the resulting figure to be quietly wrong.

## Privacy invariants to preserve

These already hold and must survive the change:

| Invariant | Where |
|---|---|
| `sendDefaultPii: false` | `sentry.ts` init |
| `beforeSend` deletes `event.user` | `sentry.ts` |
| No screenshots | `attachScreenshot` unset |
| Path scrubbing (home dir, project root) | `scrubPaths` |

Note the nice property that falls out: because `beforeSend` strips
`event.user`, the install id rides **only** on session envelopes.
**Crash reports stay completely unlinked from it** — we get a user count
without making error reports identifiable. Keep that deletion in place.

**One item is server-side, not in this repo:** Sentry can store the request IP
at ingest, and an IP is personal data under GDPR regardless of what the SDK
sends. Confirm **"Prevent Storing of IP Addresses"** is enabled on the Sentry
project (Settings → Security & Privacy). This is a checkbox, and without it
the "no personal information" claim isn't quite true.

---

## Phases

### Phase 0 — ✅ DONE
Sessions are charting in Release Health; unique users are not available.
Confirms the missing-`did` diagnosis. Phases 2–3 are the whole job.

### Phase 1 — ✅ DONE — consent: new copy + one-time re-prompt
Update `SentryOptInPrompt.tsx` and the `SettingsPage.tsx` row to describe what
is actually sent: anonymous crash reports **and** an anonymous count of app
launches. Keep the reassurances that remain true — no project files, no file
contents, no personal data.

Add `consentVersion: number` to `Settings`. Treat a stored `sentryOptIn` with
a missing or older `consentVersion` as undecided, so the prompt fires once
against the new wording. Existing opt-ins are **not** silently carried over —
that's the point of the re-prompt.

Ship this before Phase 3. Until the copy is accurate, the id shouldn't be sent.

### Phase 2 — ✅ DONE — the install id
`src/main/installId.ts`: read-or-create a UUID v4 (`crypto.randomUUID`) in
`settings.json`; clear it on opt-out so opting back in mints a fresh one.
Unit tested against a temp settings dir, per the `contextOps.ts` precedent for
main-process modules in `tsconfig.web.json`.

### Phase 3 — ✅ DONE — attach it, main only
`Sentry.setUser({ id })` in `initSentryIfOptedIn` after `Sentry.init`, and
`setUser(null)` on opt-out. Consent logic moved to `src/shared/consent.ts` so
main and renderer share one rule — two copies would eventually disagree, and
the failure mode is sending data the user didn't agree to.

**Still open:** whether the renderer starts its own session. The renderer's
`Sentry.init` now gates on the same `isOptedIn`, but I did not confirm the
renderer SDK doesn't also open a session. If it does, every launch counts
twice. Check this as part of Phase 4 — it's the likeliest way for the number
to be quietly wrong.

### Phase 4 — TODO (manual, needs a real DSN)
Against a real DSN, from a packaged build:

| Check | Expect |
|---|---|
| Two launches, same install | 1 user, 2 sessions |
| Clear the install id, launch again | 2 users |
| Trigger an error while opted in | issue has **no** user attached |

The second row is what proves the id is doing something; the third is what
proves crash reports stayed anonymous.

**Read DAU with an `environment:production` filter** — dev launches still send
sessions and would otherwise inflate it. No code change needed for this; the
environment tag already separates them.

---

## Tests

- `test/installId.test.ts` — creates once, reuses on second read, regenerates
  after a reset, survives a corrupt settings file.
- Extend `test/sentry*.test.ts` (existing scrubbing tests) with: `beforeSend`
  still deletes `event.user` even when a user is set — the guarantee that
  crash reports stay unlinked.
- No e2e. The behaviour is a network side effect against a live DSN; Phase 4's
  manual check is the real verification and an e2e would only assert our own
  mock.

---

## Decisions (answered)

| # | Decision |
|---|---|
| 1 | **Re-prompt** with a `consentVersion` bump — existing opt-ins don't carry over. |
| 2 | **Opting out resets the id**, so opting back in mints a new one. |
| 3 | **Production only** — filter DAU by `environment:production`. |
| 4 | The id lives in **`settings.json`**. |

## Open questions (answered — kept for the reasoning)

1. **Re-prompt, or just update the copy?** Users who accepted "crash reports"
   didn't accept usage counts. Cleanest is a `consentVersion` bump and a
   one-time re-prompt; lighter is updating the wording and letting existing
   opt-ins stand. I lean re-prompt — it's one dialog, and it's the difference
   between describing what we send and asking about it. Your call, and it's
   the only question here that isn't purely technical. go with your reccommendation
2. **Should opting out reset the id?** I'd say yes — otherwise opting back in
   silently rejoins the old identity. yes
3. **Dev builds too, or production only?** Sessions currently flow in both
   (`environment` distinguishes them). Filtering DAU to `production` in Sentry
   is probably enough, but worth deciding so your own launches don't inflate
   the number. production only
4. **Is `settings.json` the right home for the id?** It's per-install and
   already synced through the settings IPC. A separate file would let it
   survive a settings reset — which is arguably the wrong behaviour anyway. yes.
