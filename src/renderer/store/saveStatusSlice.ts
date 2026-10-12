// see docs/notes/save-status-machine.md — full save/sync state machine
import { create } from 'zustand';

/**
 * Enough to re-issue the failed IPC call for a retry, without asking
 * the canvas store again (its state may have moved on since the
 * original attempt).
 */
export type LastWriteAttempt =
  | {
      kind: 'write';
      tsxPath: string;
      cssPath: string;
      tsxContent: string;
      cssContent: string;
      /** Optimistic-concurrency guard; see file:write conflict path. */
      expectedTsxContent?: string;
      expectedCssContent?: string;
    }
  | {
      kind: 'patch';
      cssPath: string;
      className: string;
      newDeclarations: string;
      /**
       * Media scope for the patch, when it targets an `@media
       * (max-width: Npx)` block. Omitted for base-class patches.
       */
      media?: { maxWidth: number };
    };

export type SaveState =
  | { kind: 'saved' }
  | { kind: 'unsaved' }
  | { kind: 'saving'; attempt: LastWriteAttempt }
  | { kind: 'error'; message: string; lastAttempt: LastWriteAttempt }
  | {
      /**
       * Bidirectional sync deliberately suspended because something
       * else is writing to project files. Canvas edits stay in memory
       * — the writer skips dispatching while in this state. Triggered
       * by the agent-coexistence layers (chokidar quiet window + the
       * future terminal-busy heuristic). Display surfaces a `Resume
       * now` override so the user can force a flush.
       */
      kind: 'paused';
      /**
       * Which signal is keeping the bridge paused:
       *   - `external-edit` — chokidar saw a project file change.
       *   - `manual` — user clicked "Pause sync".
       * The indicator's popover differentiates the two so the user
       * knows what to do (wait for the agent / click resume / etc.).
       */
      reason: 'external-edit' | 'manual';
    }
  | {
      /**
       * Sync engine is back online but the canvas's in-memory state
       * doesn't match disk — usually because the user kept editing
       * during a pause. The user picks between Save canvas (force
       * overwrite disk) or Discard canvas (reload from disk).
       */
      kind: 'diverged';
      lastAttempt: LastWriteAttempt;
    }
  | {
      /**
       * Last write failed because disk had drifted under us (the
       * conflict check rejected the write). The sync engine has
       * already reloaded the canvas from disk; the user's in-flight
       * edit is gone. Retry is intentionally not offered — there's
       * nothing to retry against.
       */
      kind: 'reloaded-from-disk';
      /** Which file triggered the reload — surfaced in the toast / popover. */
      file: string;
    };

/**
 * Transient one-line notification for events the user might
 * otherwise miss (the pill alone isn't loud enough). Currently used
 * for aborted writes during external-edit windows — the indicator
 * goes to `paused`, but a toast is the actual "your edit didn't
 * land" signal the user needs to see.
 *
 * Throttled by the producer (see `notifyWriteAborted` in the bridge)
 * so a burst of aborts in quick succession only shows one toast.
 */
export type SaveToast = {
  /** Monotonic — the UI uses this to schedule auto-dismiss. */
  id: number;
  message: string;
};

type SaveStatusState = {
  state: SaveState;
  toast: SaveToast | null;
  /**
   * Phase 5.1: timestamp (ms since epoch) when the bridge most
   * recently entered `paused`. Used by the diverged-state popover
   * to filter history entries to ones that happened DURING the
   * pause (and therefore won't be on disk yet). `null` when not
   * currently paused / never paused.
   */
  pauseStartedAt: number | null;
  /**
   * A canvas edit landed WHILE a save was already in flight. Set by
   * `markUnsaved` when state is `saving` (the no-op branch — the
   * follow-on edit can't pre-empt the running write, but we must
   * remember it happened). `markConfirmed` consults this so the
   * post-write state is `unsaved` (debounce still pending) rather
   * than `saved` (which would lie about being in sync).
   *
   * Without this flag, the indicator transitions `saving → saved`
   * the moment the in-flight write completes, even though the
   * canvas has new edits waiting on a debounced write. Callers
   * watching for `saved` (e.g. E2E `waitForSaved`) then return too
   * early and read stale disk content.
   */
  dirtyDuringSave: boolean;
  /** A canvas edit landed but the debounced write hasn't fired yet. */
  markUnsaved: () => void;
  /** A write IPC is dispatching — record the attempt so we can retry on failure. */
  markSaving: (attempt: LastWriteAttempt) => void;
  /** Both IPC resolution and chokidar ack have arrived for the pending write. */
  markConfirmed: () => void;
  /** Write or patch failed — error stays visible until a later save succeeds. */
  markError: (message: string, attempt: LastWriteAttempt) => void;
  /**
   * Dedupe short-circuit: a canvas change produced no new code (identical to
   * the last write), so there's nothing to persist and we're already clean.
   * Only nudges `unsaved` → `saved`; other states are unaffected.
   */
  markClean: () => void;
  /**
   * Sync engine deferring writes because something external is
   * editing project files (or the user manually paused). Idempotent
   * — repeated calls just refresh the reason. Only transitions from
   * `saved` / `unsaved` (we don't stomp `saving` / `error` /
   * existing `paused`).
   */
  markPaused: (reason: 'external-edit' | 'manual') => void;
  /**
   * Pause cleared. If the canvas's in-memory state differs from disk,
   * transition to `diverged` (carrying the attempt for a `Save canvas`
   * action). Otherwise back to `saved`.
   */
  markResumed: (divergedAttempt: LastWriteAttempt | null) => void;
  /**
   * Last write hit a conflict (disk drifted); canvas already reloaded
   * from disk; user's pending edit was discarded. Distinct from
   * `markError` so the indicator can show the right copy (no retry).
   */
  markReloadedFromDisk: (file: string) => void;
  /** Surface a transient one-line toast. Producer is expected to
   *  throttle — calling this twice in quick succession just replaces
   *  the visible toast. */
  showToast: (message: string) => void;
  /** Dismiss the toast if it matches the id (so a stale timer doesn't
   *  clear a newer one). UI component owns scheduling this. */
  dismissToast: (id: number) => void;
};

let nextToastId = 1;

/**
 * The save-status state machine lives in its own store so undo history
 * never captures these transitions, and so feature work can subscribe to
 * save lifecycle events without re-rendering on unrelated canvas changes.
 */
export const useSaveStatusStore = create<SaveStatusState>((set) => ({
  state: { kind: 'saved' },
  toast: null,
  pauseStartedAt: null,
  dirtyDuringSave: false,
  markUnsaved: () => {
    set((s) => {
      if (s.state.kind === 'saving') {
        return { dirtyDuringSave: true };
      }
      if (
        s.state.kind === 'error' ||
        s.state.kind === 'paused' ||
        s.state.kind === 'diverged' ||
        s.state.kind === 'reloaded-from-disk'
      ) {
        return s;
      }
      return { state: { kind: 'unsaved' } };
    });
  },
  markSaving: (attempt) => {
    set({ state: { kind: 'saving', attempt }, dirtyDuringSave: false });
  },
  markConfirmed: () => {
    set((s) => {
      if (s.state.kind !== 'saving') return s;
      if (s.dirtyDuringSave) {
        return { state: { kind: 'unsaved' }, dirtyDuringSave: false };
      }
      return { state: { kind: 'saved' } };
    });
  },
  markError: (message, attempt) => {
    set({ state: { kind: 'error', message, lastAttempt: attempt }, dirtyDuringSave: false });
  },
  markClean: () => {
    set((s) => {
      if (s.state.kind !== 'unsaved') return s;
      return { state: { kind: 'saved' } };
    });
  },
  markPaused: (reason) => {
    set((s) => {
      // `error`, `saving`, and `reloaded-from-disk` are end-states
      // that we don't want to silently swallow — the user needs to
      // see them. `diverged` also stays put; pausing again after a
      // user already saw the diverged dialog would feel weird.
      if (
        s.state.kind === 'error' ||
        s.state.kind === 'saving' ||
        s.state.kind === 'reloaded-from-disk' ||
        s.state.kind === 'diverged'
      ) {
        return s;
      }
      // Already paused — refresh the reason if it changed but
      // preserve the original `pauseStartedAt` so the diverged-state
      // diff stays accurate across signal transitions.
      if (s.state.kind === 'paused') {
        if (s.state.reason === reason) return s;
        return { state: { kind: 'paused', reason } };
      }
      return {
        state: { kind: 'paused', reason },
        pauseStartedAt: Date.now(),
      };
    });
  },
  markResumed: (divergedAttempt) => {
    set((s) => {
      if (s.state.kind !== 'paused') return s;
      if (divergedAttempt) {
        // Keep `pauseStartedAt` populated so the diverged popover
        // can filter history entries from during the pause.
        return { state: { kind: 'diverged', lastAttempt: divergedAttempt } };
      }
      return { state: { kind: 'saved' }, pauseStartedAt: null };
    });
  },
  markReloadedFromDisk: (file) => {
    set({ state: { kind: 'reloaded-from-disk', file } });
  },
  showToast: (message) => {
    const id = nextToastId++;
    set({ toast: { id, message } });
  },
  dismissToast: (id) => {
    set((s) => (s.toast?.id === id ? { toast: null } : s));
  },
}));
