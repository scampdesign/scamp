# Scamp Cloud sync — Plan

Status: **proposed** — for review. Rewritten 2026-09-04 on a new footing:
the first draft was file-level backup with a sync-shaped UI; this one is
the collaboration model below, built as element-level sync on top of the
backend's existing file-level storage. The backend additions it needs
are collected in one section near the end, meant to be handed to the
website repo as-is.

Source story: `docs/backlog-10.md` §2, superseded by the target model
(reproduced in short under "The target"). Backend today:
`scamp-website/api-docs` and its reference client
`scripts/fake-client.mjs`; backend plan: `scamp-website/plans/cloud-sync.md`.
Builds on `docs/archive/2026-08-28-electron-sign-in-plan.md`, which is built.

## The target

Two systems, kept apart so the hard part only appears when asked for:

1. **Last-save-wins sync at the element level.** Everyday "we're both in
   the project" collaboration. Edits to different elements both survive;
   a genuine same-element collision goes to the most recent save.
   Element granularity works because every element carries a stable
   `data-scamp-id`.
2. **UI-driven branching.** Fork on purpose, explore, merge back.
   Invoked deliberately, never automatically.

The safety net that makes (1) acceptable: **a history tree with per-user
attribution**, so anything overwritten is always recoverable, and A/B
comparison between versions or users. Offline edits reconcile on
reconnect by matching elements on `data-scamp-id`. Built in this order:
history + attribution → element-level sync → A/B compare → branching →
visual merge. History + attribution + last-save-wins is shippable on its
own.

## The footing: element-level sync on file-level storage

The backend stores a version as a **manifest** — a map of file path to
content hash — with the file bytes content-addressed beside it. That is
a good storage model and there is no reason to replace it. What it lacks
is any notion of *elements*, *users*, or *branches*.

Scamp already has the element notion: `parseCode` turns any version's
files into an element tree keyed by `data-scamp-id`, and `generateCode`
turns a tree back into files, with a round-trip invariant the test suite
enforces on every commit. So the division of labour is:

| Concern | Lives in | Why |
|---|---|---|
| Storing bytes and versions | backend, unchanged | content-addressed manifests already give unlimited, cheap history |
| Who made a version, which branch it is on, what it was based on | backend, **additive columns** | attribution and branch structure are facts about a version |
| Deciding *which element* changed and *which side wins* | Scamp, via `parseCode` | only the client can see elements; the server sees files |
| Writing the result to disk | Scamp, via `generateCode` | that is already how every canvas edit reaches disk |

Two consequences shape everything below. **Versions stay files**, so
assets, `theme.css`, `package.json` and everything else without an
element identity move by the same mechanism as pages. And **the merge
is a client operation** — the backend's own plan leans this way ("the
client must touch the filesystem regardless"), and it is the only place
the round-trip invariant can be applied.

This is the backend plan's Option 3 (three-way merge on the manifest,
which it recommends) promoted from file identity to element identity.

## What already exists

### In Scamp

| Need | Already there |
|---|---|
| Sign-in; bearer token held in main, never in the renderer | `src/main/auth/authService.ts` → `currentAuthToken()` |
| Authenticated main-process fetch with `Origin`, 401 → sign-out | `heartbeat.ts:66` |
| Base URL per environment (`localhost:3000` unpackaged, production packaged) | `desktopAuthFlow.ts:170` `authBaseUrl()` |
| Files ↔ element tree, both directions, round-trip tested | `parseCode`, `generateCode` |
| A stable per-element identity that survives external edits | `data-scamp-id`, and the parser's duplicate-id repair |
| Reload the open canvas from disk without a sync pause | `ownWriteId` on `file:changed` |
| Local point-in-time copies as a restore point | `createSnapshot`, `.scamp/snapshots/` |
| A history UI with navigable entries | `HistoryPanel.tsx`, `historySlice` (in-session), `snapshotsSlice` |
| Live-backend integration test that skips when the server is down | `test/integration/desktopAuthLive.integration.test.ts` |
| Per-project config that travels with the folder / machine-local state that doesn't | `scamp.config.json` / `.scamp/` |
| Main-process service pattern, Electron confined to one file | `src/main/mcp/` |

### In the backend

Built and working, per `cloud-backup.md`: content-addressed blobs,
manifests as versions, unlimited history, push
(`prepare → upload → commit`, resumable) and pull
(`manifest → urls → download`, hash-verified, resumable), a `deviceId`
column on every version, presigned direct upload, an entitlement gate.

Not built, and needed here: members, per-version `userId`, a
`baseVersionId` precondition, branches. All four are in
"Backend requirements" below.

**One new client dependency, justified:** `ignore`, the `.gitignore`
matcher the reference client uses. Gitignore semantics are not twenty
lines, and the failure mode of a hand-rolled subset is uploading
`node_modules` (~68,000 files).

## Design

### Identity and units

- **Page and component files** are the unit of *storage* and the unit
  of *history*: a version is a manifest, exactly as today.
- **Elements** are the unit of *reconciliation*. Within a page (or
  component) file, elements are matched across versions by
  `data-scamp-id`. Ids are unique per file, so the key for an element is
  `(path, id)`.
- **Everything else** — `theme.css`, `scamp.config.json`, `DESIGN.md`,
  `public/assets/*`, `package.json` — reconciles at file level with the
  same last-save-wins rule. Those files have no elements; pretending
  otherwise buys nothing.
- **Page-level extras** that live in a page file but are not elements —
  custom `@media` blocks, `@keyframes`, verbatim pseudo-class blocks —
  reconcile as one unit per page under the same rule. They are rare and
  a real per-block merge is not worth its complexity now.

### The three-way element merge

Given the **base** (the version this machine last synced with), **mine**
(disk now) and **theirs** (the server head), for every page path in the
union, parse all three and merge per element id:

| Since base | Result |
|---|---|
| changed only in mine | mine |
| changed only in theirs | theirs |
| changed in both, to an identical element | either — no collision |
| changed in both, differently | **collision** → the side whose version is more recent wins; the loser is recorded (see history) |
| deleted in one, untouched in the other | deleted |
| deleted in one, changed in the other | collision, same rule |
| added on one side | added |

"Changed" is structural equality of the parsed element — the same
comparison the round-trip test uses — so whitespace and declaration
order never count as an edit. **Parent and order** are element fields
(`parentId`, `childIds`), so a move is an edit to the moved element and
its old and new parents, and the table above handles it; a child whose
parent was deleted on the other side reattaches to the nearest surviving
ancestor rather than vanishing.

The merged tree is written through `generateCode`, so the result on disk
is always canonical Scamp output, and a `cloud_merge` snapshot is taken
first. Because `parseCode` accepts hand-written files, an edit from VS
Code or an agent takes part in a merge like any other — it is parsed
into elements the same way it already is when the watcher reloads it.

"More recent" is the version's `createdAt` on the server, which is the
time the save reached the cloud. That is a deliberate simplification: it
is the only clock all machines share, and it makes the rule the same
online and offline. An offline machine's edits are, by construction, the
older side on reconnect — which is why history matters.

### History with attribution — the safety net

Every version already exists on the server. Three additions make it the
safety net the model requires:

1. **Attribution.** `userId` on every version (backend). The history
   panel shows who, when, and — by parsing the version and its parent —
   *which elements* changed. Element-level change lists are computed by
   the client, never stored.
2. **Losers are kept.** A merge that overrode an element records the
   overridden version's id against the winning version as
   `supersedes[]` (client-side, in `.scamp/cloud.json`, and mirrored
   into the version's `note` on commit so other machines see it). "Your
   edit to *Hero title* was overwritten by Bea at 14:02 — restore it"
   is one click.
3. **Restore at element granularity.** Restoring a version can restore
   the whole page or just one element from it, because the version is
   parsed into elements the same way. This is what turns "find my
   version" into "get my header back without losing Bea's footer".

The existing `HistoryPanel` already lists snapshots and in-session
entries; cloud versions join it as a third source, rendered as a tree
once branches exist. Local snapshots remain — they are the offline
safety net and cost nothing.

### Sync, as the user sees it

Per project, per account, opt-in. A **Sync** toggle on the start-screen
card, with a status line, and a pill next to the save-status pill in the
toolbar once a project is open.

| Account state | Toggle | Line |
|---|---|---|
| signed out | disabled | "Sign in to sync" |
| Cloud off for the account (`402`) | disabled | "Scamp Cloud isn't on for this account" |
| email unverified (`403`) | disabled | "Verify your email to sync" |
| project linked on another account, not shared with this one (`404`) | off | "Not linked on this account" |
| on, up to date | on | "Synced · 2 min ago" |
| on, pushing / pulling | on | "Syncing… 12 / 48" |
| on, merged | on | "Synced · merged 3 changes from Bea" |
| on, paused | on | "Sync paused — offline" |

Turning it on the first time creates the cloud project and pushes.
Turning it off stops syncing and keeps the cloud project and its history
— the backend's delete is irreversible and removes every version, so
"Remove from Scamp Cloud" is a separate, confirmed action, later.

The start screen doesn't know the auth state today (`AccountPanel`
fetches its own). Lift it into a small `authSlice` so the cards and the
panel read one source.

### The sync loop

Runs in main, in `src/main/cloud/`, with the Electron glue confined to
`lifecycle.ts` as in `src/main/mcp/`.

**Push** — after a local write is *confirmed* (the save-status ack), not
when dispatched: local first, cloud second. Coalesce until writes have
been quiet for `PUSH_QUIET_MS` (start at 5 s). Build the manifest with
the ignore floor and the hash cache; `prepare` → upload what is missing,
16-wide, exactly as the reference client → `commit` **with
`baseVersionId`**.

**On `409` (stale base)** — the everyday collaboration case: pull the
server head's manifest, fetch only the pages that differ from base,
run the element merge, write the result to disk as own writes (with
`ownWriteId`, so the open canvas reloads without the external-edit
pause), and push again with the new base. Loop until the commit lands;
in practice once.

**Pull** — on project open, on app focus, and on a timer (start at 60 s;
a websocket is a later optimisation the backend plan already reserves
Pusher for). A newer head with no local changes since base is applied
directly; with local changes it is the same merge as above. Nothing
about a pull is modal.

**Skips**, each with a named reason the status shows: signed out, Cloud
off, email unverified, not a member, offline, nothing changed. None is a
toast.

**Retry** with backoff (30 s → 5 min) on transport failure, plus on the
next confirmed save; never on the account-state reasons a retry cannot
fix. Safe because content is immutable and content-addressed: an
interrupted push leaves unreferenced blobs, never corruption.

**Offline** is detected by the fetch failing. On reconnect the queued
push runs, the `409` path does the reconciliation, and offline edits
land as the older side of any collision — exactly the model's rule.

### Where state lives

`scamp.config.json` → `cloud: { projectId, enabled }` — travels with
the folder, so a project pulled onto a second machine, or shared with a
member, is already linked.

`.scamp/cloud.json` — machine-local, gitignored, unwatched, never in a
manifest: `baseVersionId`, `baseManifest`, `branch`, the hash cache
(`path → { size, mtimeMs, hash }`), and `supersedes` notes awaiting
commit. `baseManifest` is what makes "Synced" honest — computed by
comparing manifests, not trusting a timestamp — and `baseVersionId` is
the common ancestor every merge needs.

### The manifest and the ignore floor

Port `walk()` from the reference client: the root `.gitignore` if
present, else the built-in default, plus a hard floor. Scamp's floor is
the reference floor plus what Scamp itself writes into a project:

```
node_modules  .git  .next  .open-next  .DS_Store     ← reference floor
.scamp                                                ← snapshots, thumbnails, mcp.json, cloud.json
.mcp.json  .cursor/mcp.json  .gemini/settings.json  .kiro/settings/mcp.json
.claude/settings.local.json
```

The agent-config paths carry the **MCP token**. A manifest is the whole
project, so this list is the only thing between a bearer token and
object storage; a test asserts each path is excluded from a walk of a
scaffolded project, and the live test fails if `.mcp.json` ever appears
in a pushed manifest.

### Branches (later)

A branch is a named head on the server: versions gain `parentVersionId`
and `branch`, and `commit` targets a branch. Scamp's `.scamp/cloud.json`
records which branch this checkout is on. Creating a branch is a commit
with a new name; switching writes the target head to disk (as own
writes) after prompting to save-to-branch if there are unsynced edits —
the stash analogue. Merging back is the same element merge with `base =
the fork point`, and the residual genuine collisions — the ones a rule
should not decide — are the visual merge UI, deliberately last.

Branches are per project and visible to every member. The history
panel draws the tree.

### A/B compare (after history)

Two versions, or "mine vs. theirs" on a collision: parse both, diff per
element, render side by side on the canvas with the changed elements
outlined. No server work; it is the same element diff the history panel
already computes to show *what* changed.

### IPC

Constants in `ipcChannels.ts`, payloads in `types.ts`, one handler file.

| Channel | Direction | Payload |
|---|---|---|
| `cloud:enable` / `cloud:disable` | renderer → main | `{ projectPath }` |
| `cloud:status` | renderer → main | `{ projectPath }` → `CloudStatus` |
| `cloud:syncNow` | renderer → main | `{ projectPath }` |
| `cloud:history` | renderer → main | `{ projectPath, branch?, before? }` → attributed versions |
| `cloud:versionElements` | renderer → main | `{ projectPath, versionId }` → parsed tree + element diff vs. parent |
| `cloud:restore` | renderer → main | `{ projectPath, versionId, path?, elementId? }` |
| `cloud:branches` / `cloud:createBranch` / `cloud:switchBranch` / `cloud:merge` | renderer → main | Phase 5–6 |
| `cloud:statusChanged` | main → renderer | `{ projectPath, status }` |

```ts
type CloudStatus =
  | { kind: 'off' }
  | { kind: 'unavailable'; reason: 'signed-out' | 'cloud-off' | 'email-unverified' | 'not-member' }
  | { kind: 'synced'; versionId: string; at: string; merged?: { from: string; count: number } }
  | { kind: 'pending' }
  | { kind: 'syncing'; done: number; total: number }
  | { kind: 'paused'; reason: 'offline' | 'error'; message: string; retryAt: string };
```

## Backend requirements

Everything below is additive to the existing storage model. Hand this
section to the website repo; Scamp's Phase 2 onwards depends on it in
the order listed.

1. **Members.** A project has an owner and a set of members; every
   `/api/projects/{id}/*` endpoint serves members as well as the owner.
   Invitation UX is the website's; Scamp only needs `GET /api/projects`
   to include projects the user is a member of, and a `role` on each.
   *Needed by: Phase 2.* Without it the target's first sentence — "let
   multiple people work on the same project" — is impossible.
2. **`userId` on every version**, returned by the version list and the
   manifest endpoint, alongside the existing `deviceId` (keep it; it is
   useful as a label). *Needed by: Phase 2.*
3. **`baseVersionId` on `push/commit`**, returning `409 { head }` when
   the branch head is not that version. This is the backend plan's own
   Phase 1, verbatim. *Needed by: Phase 3.* Until it exists a stale push
   silently overwrites, and nothing on the client can detect it.
4. **A free-text `note` on commit**, echoed on the version — Scamp uses
   it for the `supersedes` record. *Needed by: Phase 3.* A structured
   column is better if cheap.
5. **Branches.** `parentVersionId` and `branch` on versions, a per-branch
   head, `commit` and `manifest` accepting `branch`, plus create / list /
   delete. *Needed by: Phase 5.*
6. **A way for a local account to use `/api/projects/*`.**
   `conventions.md` requires a verified email; `authentication.md` says
   verification is deliberately off and `emailVerified` is always
   `false`. The backend's check scripts push successfully, so a path
   exists but is undocumented. *Needed by: Phase 0.* Also confirm the
   bearer token is accepted on these routes — `desktop-auth.md` says
   every authenticated call takes it, `authentication.md` (older) says
   cookies only.

Not needed: any server-side knowledge of elements, any merge logic, any
change to blob storage.

## Phases

In the target's dependency order. Each is shippable behind the toggle.

### Phase 0 — probe the contract (half a day)

A throwaway script with a real bearer token from a signed-in dev build
against `localhost:3000`: bearer on `/api/projects`; what a fresh account
gets (`402`? `403 EMAIL_NOT_VERIFIED`?); after the admin switch, a
push/pull round trip via the reference client. Resolves requirement 6
with evidence before anything is built on an assumption.

### Phase 1 — transport and opt-in (no backend changes)

`cloudApi`, `manifest` (ignore floor, hash cache), `push`, `pull`,
`cloudState`, `cloudSync` (push after ack, coalescing, retry, skips),
`lifecycle`; the IPC surface; `cloud` on `ProjectConfig`; `cloudDeviceId`
in `Settings` (a fresh UUID — **not** `installId`, which is
privacy-scoped to Sentry and reset on opt-out); `authSlice`; the card
toggle and status line; `docs/user_docs/cloud-sync.md`; an update to
`accounts.md`, which currently promises the app "never uploads your
work" and must say "unless you turn on Sync for a project".

Tests: every pure module unit-tested with injected `fs`/`fetch` replaying
the documented response bodies; `manifest` against a temp dir; the
ignore-floor secret test; one live integration test gated like
`desktopAuthLive`. E2E: toggle disabled with the sign-in reason when
signed out.

**Single-machine only, and deliberately so** — a second machine pushing
would silently overwrite, because requirement 3 doesn't exist yet. The
toggle copy says "backup" until Phase 3, so nobody is promised sync the
backend can't honour.

### Phase 2 — attributed history (needs backend 1, 2)

Cloud versions in the `HistoryPanel` with who and when; the element
change list per version (parse version and parent, diff); restore of a
whole version, one page, or one element, each through a `cloud_restore`
snapshot and own writes; `docs/notes/cloud-sync.md`.

This is the safety net. Nothing in Phase 3 ships before it.

### Phase 3 — element-level last-save-wins (needs backend 3, 4)

`baseVersionId` on commit; the `409` path; `lib/elementMerge.ts` — pure,
exhaustively unit-tested against the table above, including moves,
parent deletion, and the page-level extras; the `supersedes` record and
its "restore my version" affordance; pull on open / focus / timer; the
toolbar pill. Tests: the merge is the whole story — every row of the
table, plus a round-trip assertion that merge(base, mine, theirs) written
through `generateCode` and re-parsed equals the merged tree. Live test:
two temp checkouts of one project pushing overlapping edits.

**Done when** two machines edit different elements of one page and both
survive; the same element and the later save wins with the loser
restorable from history; offline edits reconcile on reconnect. That is
the shippable collaboration story.

### Phase 4 — A/B compare

Two versions or mine-vs-theirs on the canvas, changed elements outlined,
per-element restore from either side. No backend work.

### Phase 5 — branches (needs backend 5)

Create / switch / name; the save-to-branch prompt on switch; the history
panel as a tree.

### Phase 6 — visual merge

The residual-collision UI for merging a branch into main: list the
collisions, show both on canvas, per-element choose, everything else
already merged by the rule. Last because it is the only piece that
needs a genuinely new UI concept.

## Risks

- **The backend order.** Phases 2 and 3 are gated on the website repo.
  Phase 1 is real, useful work in the meantime — but its copy must not
  say "sync" until Phase 3, or the first two-machine user will lose an
  edit silently.
- **Uploading a secret.** Covered by the floor and two tests; called out
  because a manifest is the whole project.
- **Ids that aren't stable.** The element merge assumes `data-scamp-id`
  is the identity. The parser repairs duplicates on load
  (`dedupedFrom`), which can *reassign* an id; a merge should treat a
  repaired element as new rather than as the original. Pin it in the
  merge tests.
- **Server time as the tiebreak.** Simple and shared, but a machine that
  was offline for a day loses every collision on reconnect. That is the
  model's rule and history covers it; the copy on reconnect should say
  what happened rather than merge silently.
- **Hashing cost.** The hash cache is Phase 1, not later — a large
  `public/assets/` otherwise re-hashes on every push.

## Open questions

1. **Requirement 6** — how a local account gets past the verified-email
   gate. Phase 0 finds out; may need a backend change first.
2. **Tiebreak clock.** Server `createdAt` (recommended above) versus a
   per-element last-modified stamp Scamp would have to persist somewhere
   the files can't carry. Server time is honest about what "last save"
   means in a sync system; the stamp is more "fair" to offline edits but
   needs a sidecar file that can drift from the TSX.
3. **Page-level extras.** Whole-unit last-save-wins per page for
   `@keyframes`, custom `@media`, pseudo-class blocks — or per block?
   Recommendation: whole unit now; they're rare and the history covers
   the loss.
4. **Pull trigger.** Open + focus + 60 s poll, or a websocket. Poll
   first; the backend plan already earmarks Pusher if it's needed.
5. **Toggle off** keeps the cloud project. A separate, confirmed
   "Remove from Scamp Cloud" later. Confirm.
