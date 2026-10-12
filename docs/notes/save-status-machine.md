---
title: Save / sync state machine
related:
  - src/renderer/src/syncBridge.ts
  - src/renderer/store/saveStatusSlice.ts
  - src/main/ipc/file.ts
  - src/main/ipc/fileConflict.ts
  - src/main/pendingWrites.ts
  - src/main/watcher.ts
  - src/renderer/src/lib/externalEditTracker.ts
  - src/renderer/src/lib/quietWindow.ts
---

# Save / sync state machine

How a canvas edit becomes bytes on disk, how the app knows the write
landed, and how it tells its own writes apart from external (agent /
manual) edits. This is the single biggest cold-read load in the
codebase — when a user reports "Save failed" or "my edit vanished",
start here, not in five files.

Primary files:
- `src/renderer/src/syncBridge.ts` — renderer orchestration
- `src/renderer/store/saveStatusSlice.ts` — the visible state machine
- `src/main/ipc/file.ts` + `src/main/ipc/fileConflict.ts` — main-side write + conflict check
- `src/main/pendingWrites.ts` + `src/main/watcher.ts` — write tracking + ack emission
- `src/renderer/src/lib/externalEditTracker.ts`, `src/renderer/src/lib/quietWindow.ts` — external-edit guards
- See also `docs/notes/agent-coexistence.md` for the concurrent-write race and the late-echo guard rationale.

## The visible states (`saveStatusSlice.ts`)

`SaveState` is a discriminated union:

| kind | meaning |
|---|---|
| `saved` | canvas matches disk |
| `unsaved` | an edit landed, debounce pending |
| `saving` | write IPC in flight (`attempt` retained for retry) |
| `error` | write failed; persists until a later write succeeds |
| `paused` | writes deferred — `reason: 'external-edit' \| 'manual'` |
| `diverged` | quiet window expired and disk no longer matches our baseline |
| `reloaded-from-disk` | a conflict was detected; canvas was reloaded to the on-disk version |

Mutators (all on `useSaveStatusStore`): `markUnsaved`, `markSaving`,
`markConfirmed`, `markError`, `markClean`, `markPaused`, `markResumed`,
`markReloadedFromDisk`, plus transient `showToast` / `dismissToast`.

Two subtleties:
- `markUnsaved` while already `saving` does **not** transition — it sets
  `dirtyDuringSave = true`, so `markConfirmed` lands on `unsaved`
  (not `saved`), forcing a follow-up write for the edit that arrived
  mid-flight.
- `markPaused` refuses to stomp `saving` / `error` / `reloaded-from-disk`
  / `diverged` — those carry more important information than a pause.

## Normal save — ordering

1. **Edit → debounce.** A canvas mutation fires the store subscription
   in `syncBridge.ts`. It calls `markUnsaved()`, regenerates the preview
   source, and (re)starts the debounce timer — `WRITE_DEBOUNCE_MS = 200`.
2. **Flush.** `flushDebouncedWrite → writeIfDirty` regenerates the final
   code, compares it to the `lastSerializedTsx/Css` baseline, captures
   that baseline as the `expected*` content, and calls `dispatchPageWrite`.
3. **Dispatch.** `dispatchPageWrite` calls `markSaving(attempt)` and
   invokes the `IPC.FileWrite` (`'file:write'`) handler with the tsx/css
   paths, content, and `expected*` content.
4. **Main writes.** `handleWrite` (`file.ts`) runs `checkWriteConflict`
   first (see below). If clear, it mints a `writeId` (uuid), calls
   `registerPendingWrite(path, writeId, suppressChanged=true)` for *both*
   paths, atomically writes both, and returns `{ ok: true, writeId }`.
   On write failure it `cancelPendingWrite`s both paths.
5. **Renderer registers.** The IPC promise resolves; `registerPendingSave`
   records the write keyed by `writeId` with an `expected` set of the two
   paths and an empty `acked` set, drains any buffered `earlyAcks`, and
   arms the watchdog (`ACK_WATCHDOG_MS = 2000`).
6. **Watcher acks.** Chokidar sees each file change and calls
   `pending.consume(path)` in the watcher, which emits an
   `IPC.FileWriteAck` (`'file:writeAck'`, payload `{writeId, path}`) and
   — because the write was registered with `suppressChanged` — suppresses
   the normal `file:changed` broadcast. If chokidar never fires the
   stability event, the tracker still acks on its own
   `ACK_EXPIRY_MS = 400` expiry, so the renderer gets exactly one ack per
   path.
7. **Confirm.** Each ack runs `handleAck → maybeConfirm`. Once `ipcDone`
   is true **and** every `expected` path is in `acked`, the watchdog is
   cleared and `markConfirmed()` fires → `saved` (or `unsaved` if
   `dirtyDuringSave`).

`earlyAcks` (`EARLY_ACK_TTL_MS = 1000`) exists because on fast
filesystems the ack can arrive *before* the IPC promise resolves; the
ack is buffered and applied when `registerPendingSave` runs, then
expires so stray acks don't leak.

## The watchdog

If the IPC resolved but the expected acks never arrive within
`ACK_WATCHDOG_MS = 2000`, the watchdog calls `clearPending` and
`reportError('No confirmation from disk watcher', attempt)` → `error`
state. It is a true safety net: step 6 already guarantees one ack per
write via the 400 ms expiry, so the 2 s window only catches IPC delivery
failure. A "Save failed: No confirmation from disk watcher" report means
the ack IPC didn't make it back, not that the file didn't write.

## Telling our own write apart from an external edit

Two layered guards, both in `syncBridge.ts` (rationale in
`docs/notes/agent-coexistence.md`):

- **Late-chokidar echo guard (byte-equality).** `onFileChanged` returns
  early if the incoming `tsxContent` / `cssContent` byte-match
  `lastSerializedTsx` / `lastSerializedCss` — i.e. it's our own write
  echoed back by the watcher. The baseline is updated on every dispatch,
  on conflict adoption, and on discard.
- **External-edit tracker + quiet window.** `externalEditTracker`
  marks the active pair as "reloading" around a `file:changed` reload so
  `writeIfDirty` won't race a write into it. `quietWindow`
  (`DEFAULT_QUIET_WINDOW_MS = 2500`) is extended on each external event;
  while quiet, `writeIfDirty` calls `markPaused('external-edit')` and
  bails. `reconcileAfterQuiet` (scheduled when the window expires)
  regenerates, compares to disk, and either returns to `saved`, flushes
  the user's pending change, or — if disk diverged and the user didn't
  edit — leaves the agent's change alone and goes `diverged`.

### The CSS panel's own patch is not an external edit

`file:patch` registers its pending write with `suppressChanged = false`
on purpose: the panel needs the resulting `file:changed` reload to
refresh the canvas from the file. But that event used to run the whole
external-edit path — quiet window, `markPaused('external-edit')`, the
"an external editor is writing" copy — for 2.5 s after every Cmd+S,
before the ack flipped it to Saved. To the user that read as "nothing
was saved, the file was edited externally", and then it saved.

Now `pending.consume` returns the `writeId`, `emitChange` attaches it to
the broadcast as `ownWriteId`, and `makeFileChangedHandler` reloads
without touching the quiet window when it is present. The ack then
confirms the patch as usual. The late-echo guard and the tracker
mark/clear are unchanged. `test/e2e/properties-panel/css-save-no-pause.spec.ts`
asserts the indicator never shows Paused around a CSS-panel save.

## Conflict (optimistic concurrency) — ordering

`checkWriteConflict` (`fileConflict.ts`) is the main-side guard. It
short-circuits to "no conflict" when either `expected*` is undefined
(export, scaffolds, migrate pass them undefined). Otherwise it reads both
paths and, if actual disk content ≠ expected, returns
`{ actualTsxContent, actualCssContent }`.

1. `handleWrite` returns `{ ok: false, conflict }` *without writing*.
2. The renderer's dispatch `.then` calls the `onConflict` callback →
   `onWriteConflict`.
3. `onWriteConflict` skips the reload if the user has since navigated
   away from the target, otherwise adopts the disk content into
   `lastSerializedTsx/Css`, `parseCode`s it, calls `store.reloadElements`,
   and `markReloadedFromDisk(target.name)` (+ an app-log line that the
   in-flight edit was dropped). In `silent` mode (initial-load canonical
   migration) it lands on `saved` instead.

No pending write is registered on the conflict path, so the watchdog
never arms.

## IPC channels

| Direction | Channel | Payload |
|---|---|---|
| Renderer → Main | `IPC.FileWrite` (`'file:write'`) | `FileWriteArgs` → `FileWriteResult` |
| Renderer → Main | `IPC.FilePatch` | `FilePatchArgs` → `FilePatchResult` |
| Main → Renderer | `IPC.FileWriteAck` (`'file:writeAck'`) | `{ writeId, path }` |
| Main → Renderer | `IPC.FileChanged` (`'file:changed'`) | external change broadcast |

(Line numbers drift; navigate by the function/constant names above.)
