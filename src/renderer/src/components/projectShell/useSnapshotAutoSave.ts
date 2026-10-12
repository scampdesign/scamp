import { useEffect } from 'react';

import { useCanvasStore } from '@store/canvasSlice';
import { useSnapshotsStore } from '@store/snapshotsSlice';

import { flushPendingPageWrite } from '../../syncBridge';

/** Take at most one auto-save snapshot per this much canvas activity. */
const AUTO_SAVE_INTERVAL_MS = 2 * 60_000;

/**
 * The "significant canvas change" snapshot trigger: while editing, take an
 * `auto_save` snapshot at most once every 2 minutes of canvas activity, so
 * the user has durable in-session restore points without one per action.
 * Finer per-edit granularity comes from the in-memory undo entries the
 * History panel interleaves between these snapshots — see
 * docs/notes/snapshots.md — so this interval stays coarse to limit disk
 * writes. Idle time contributes nothing (the check only runs on a real
 * element change).
 * Disabled when `enabled` is false (the project's `snapshotAutoSave`
 * config flag). Flushes the pending write first so the snapshot includes
 * the latest canvas state. See docs/notes/snapshots.md.
 */
export const useSnapshotAutoSave = (
  projectPath: string,
  enabled: boolean
): void => {
  useEffect(() => {
    if (!enabled) return;
    let lastAutoMs = Date.now();
    const unsub = useCanvasStore.subscribe((state, prev) => {
      // Snapshot preview swaps elements in/out without a real edit — don't
      // treat it as activity (and never snapshot mid-preview).
      if (state.snapshotPreview !== null || prev.snapshotPreview !== null) {
        return;
      }
      // Only genuine element edits count as activity.
      if (state.elements === prev.elements) return;
      const nowMs = Date.now();
      if (nowMs - lastAutoMs < AUTO_SAVE_INTERVAL_MS) return;
      lastAutoMs = nowMs;
      flushPendingPageWrite({ respectPause: true });
      void useSnapshotsStore.getState().takeSnapshot(projectPath, 'auto_save');
    });
    return unsub;
  }, [projectPath, enabled]);
};
