---
slug: agent-coexistence
summary: How Scamp's sync engine stays out of an external editor's way (Claude Code, Cursor Agent, vim, IDEs). Covers the seven save-status states, the pause signals, and what's exempt.
related:
  - components-sync
  - save-status-machine
---

# Agent coexistence

Scamp's bidirectional sync (canvas ↔ files on disk) has a hard problem: when an external agent edits the same file at the same time, who wins? This note captures the design.

The plan that drove the implementation lives at `/docs/agent-coexistence-plan.md` — this note is the "what shipped" version.

## The seven save-status states

`saveStatusSlice` drives the indicator pill in the toolbar. Each state has a defined trigger, visual treatment, and (where applicable) recovery action.

| State | Trigger | Indicator | Recovery |
|---|---|---|---|
| `saved` | Canvas matches disk. | "Saved" (calm green check). | n/a |
| `unsaved` | Canvas edit landed; debounced write pending. | "Unsaved" (warning yellow dot). | Wait — auto-saves in 200ms. |
| `saving` | Write IPC in flight. | "Saving…" (spinner). | n/a |
| `error` | Write failed with a generic IPC error. | "Save failed" (red, **Retry** button). | Click Retry; the failed attempt re-dispatches. |
| `paused` | External edit detected (Phase 1.1) or quiet window open (Phase 3.2). Canvas edits queue, no IPC dispatched. | "Paused" (blue pause icon, clickable). | Click to expand: **Resume now** force-clears the window and reconciles. Otherwise auto-resumes when the window expires. |
| `diverged` | Quiet window expired, canvas state ≠ disk state. | "Diverged" (amber, clickable). | Click to expand: **Save canvas** force-overwrites disk; **Discard canvas** reloads from disk. |
| `reloaded-from-disk` | A canvas-side write was main-process-rejected because disk drifted. Canvas already reloaded; user's in-flight edit was discarded. | "Reloaded" (neutral, clickable, **no Retry**). | Click to expand: read what happened. Cleared on the next successful save cycle. |

The `error` and `reloaded-from-disk` states are both terminal — they persist through canvas edits until a fresh save cycle (or user-driven discard) clears them. Other transitions are governed by `markUnsaved`'s guard list in `saveStatusSlice.ts`.

## The two pause signals

The sync engine pauses (refuses to dispatch canvas-side writes) when EITHER of two conditions is true:

### 1. External edit pending (Phase 1.1)

Tracked in `src/renderer/src/lib/externalEditTracker.ts`. A per-path set of files currently being reloaded by `onFileChanged`. Set at the top of the chokidar handler (after the late-echo guard), cleared in its `finally` block. Lives just long enough to protect against the synchronous race where a canvas edit fires `writeIfDirty` while the renderer is mid-reload.

### 2. Quiet window (Phase 3.2)

Tracked in `src/renderer/src/lib/quietWindow.ts`. Set on every chokidar event for a project file; rolls forward 2.5s on each subsequent event. Catches agent write bursts where 3-5 writes to the same file land in close succession — Scamp stays paused until the burst fully settles plus a grace window.

The two signals overlap but cover different timing: the tracker is sub-millisecond protection against the synchronous race; the quiet window is multi-second protection against intentional bursts.

A third, the user's own **Pause sync**, defers writes the same way until they resume.

There is deliberately no "agent in the terminal" signal. One shipped (polling the pty's foreground process) and was removed on 2026-10-12: an idle Claude Code at its prompt counts as a foreground process, so sync stayed off for as long as the agent was open, and edits made then lived only in memory until the agent's next write reloaded over them. The two signals above plus the compare-and-swap below already keep Scamp from overwriting an agent.

### Edits never stay only in memory

A paused write sets `canvasChangedDuringQuiet`, so the reconcile when the pause ends flushes it instead of reporting **Saved**. And leaving a target (`flushPendingPageWrite()`, which every page / component switch calls) writes even while paused, through the compare-and-swap and merge; only the auto-snapshot and project close pass `{ respectPause: true }`. A refused merge for a target already left skips the canvas reload but still writes the merge.

## When the compare-and-swap refuses

The pause signals above are the common case. Underneath them a canvas
write still carries `expectedTsxContent` / `expectedCssContent`, and
main refuses it when disk says something else — the race the signals
are too coarse to catch. Main runs a page write and a CSS-panel patch for
one stylesheet one after the other (`serializeByKey` in `fileOps.ts`), so
the check and the write can't be split by the other's write.

That refusal used to cost the user their edit: Scamp adopted the disk
version, logged "your in-flight edit was dropped", and put the
indicator in `reloaded-from-disk`. Since phase 4 of
`docs/plans/incremental-writes-plan.md` it tries a three-way merge
first (`syncBridge/mergeWrite.ts` over `lib/threeWayMerge.ts`): base is
the version the write claimed, ours is what it carried, theirs is what
disk holds. Both files have to merge, and the merged pair has to read
back with every field the design change touched, or the old behaviour
runs unchanged.

A merge writes immediately against the disk version it merged with, and
carries no intent of its own, so a second refusal on the same write
adopts disk rather than looping. What the user sees is the save
completing plus one app-log line: "<page> was edited outside Scamp;
merged that edit with yours."

## What's exempt

These files don't pause the sync engine and aren't covered by the quiet window:

- **`theme.css`** — managed by Scamp's Fonts and Theme panels but never written by the canvas regen pipeline. Agents can edit `theme.css` freely while the canvas is active.
- **`agent.md` / `CLAUDE.md`** — fully managed by Scamp; rewritten on every project open. Don't edit by hand.
- **`scamp.config.json`** — project settings; not part of the canvas pipeline.

Everything else under the project root that matches `*.tsx` or `*.module.css` is on the protected list.

## Save canvas vs Discard canvas

When the quiet window expires with the canvas diverging from disk, the user picks:

- **Save canvas** — force-overwrite disk with the canvas's current state. No conflict check, no expected-content guard. This is "I know there's an external edit; I want mine to win." The user already saw the indicator transition through `paused`, so this isn't accidental.
- **Discard canvas** — re-parse disk content and reload the canvas. In-memory canvas changes since the pause started are lost.

The popover's `Save canvas` uses the bridge's `saveDivergedCanvasImpl`; `Discard canvas` uses `discardDivergedCanvasImpl`. Both go through normal save-status transitions so the toast / indicator behave the same as any other write.

## Toast for aborted writes

A separate `toast` field on `saveStatusSlice` surfaces a transient banner — anchored below the toolbar — when Scamp has to abort a canvas write because an external edit is in progress. Auto-dismisses after 4s, throttled to one toast per 4s (so a burst of aborts doesn't spam).

This is the dedicated "you did something but it didn't land" signal. The pill going to `paused` is the persistent state; the toast is the moment-of-event surface.

## Per-OS notes

The pause signals are all file-system or user driven, so they behave the same on Linux, macOS, and Windows.

## How to test locally

Quick smoke test that the pause works:

1. Open any project in Scamp.
2. Make a canvas edit (draw a rect, drag an element).
3. Without releasing focus from Scamp, run from another terminal: `echo "/* hi */" >> app/page.module.css` (or whatever the active page's CSS path is).
4. Observe: the indicator should flip to `Paused` (blue pause icon) within ~2 seconds. A toast should appear: "Your canvas change wasn't saved — home was just edited externally."
5. Wait 3 seconds without touching anything. The indicator should auto-resume — either back to `Saved` (if canvas matched disk after the reload) or to `Diverged` (if canvas had pending changes).
6. If diverged, click the pill, then pick Save canvas or Discard canvas.

## Where the dangling refs went

Earlier code commented `see docs/known-issues.md — "Concurrent-write race"` and `see docs/known-issues.md — "late-chokidar echo race"`. That doc never existed (the references slipped in during an earlier session). The content lives here now:

- "Concurrent-write race" → this note's [What's exempt](#whats-exempt) section + Phase 1.1 protection.
- "late-chokidar echo race" → the byte-equality guard in `syncBridge.ts onFileChanged` that ignores chokidar events whose payload byte-matches our own last write.

Specific affected callsites (`src/main/ipc/fileConflict.ts:14`, `src/renderer/src/syncBridge.ts:471, 1013`, `src/shared/types.ts:284`) should be updated to point here on the next pass through those files.
