// Pure display helpers for the snapshot history panel. Kept separate from
// the slice (which touches window.scamp) so they're trivially unit-tested.
import type { SnapshotMeta, SnapshotTrigger } from '@shared/types';

import type { HistoryEntry } from './historyTypes';

/** The icon family a trigger maps to in the panel. */
export type TriggerIcon =
  | 'session-open'
  | 'session-close'
  | 'agent'
  | 'manual'
  | 'auto'
  | 'restore';

export const triggerIcon = (trigger: SnapshotTrigger): TriggerIcon => {
  switch (trigger) {
    case 'session_open':
      return 'session-open';
    case 'session_close':
      return 'session-close';
    case 'agent_edit':
    case 'agent_session':
      return 'agent';
    case 'manual':
      return 'manual';
    case 'auto_save':
      return 'auto';
    case 'before_restore':
      return 'restore';
  }
};

/**
 * Snapshots are stored oldest-first in `snapshots.json`; the panel shows
 * newest at the top. Returns a new array (doesn't mutate).
 */
export const snapshotsNewestFirst = (
  snapshots: ReadonlyArray<SnapshotMeta>
): SnapshotMeta[] => [...snapshots].reverse();

/** `pageCount` → "2 pages" / "1 page". */
export const formatPageCount = (count: number): string =>
  `${count} ${count === 1 ? 'page' : 'pages'}`;

/**
 * One row in the merged History panel: either a durable on-disk snapshot
 * or an in-session undo entry. `ts` is normalised to epoch ms for sorting
 * (snapshots store ISO strings, undo entries store ms). Undo rows carry
 * the entry's index in the active page's stack (for `jumpToHistory`) plus
 * its position relative to the cursor.
 */
export type TimelineItem =
  | { readonly kind: 'snapshot'; readonly ts: number; readonly snapshot: SnapshotMeta }
  | {
      readonly kind: 'undo';
      readonly ts: number;
      /** Index in the active page's `entries`; passed to `jumpToHistory`. */
      readonly index: number;
      readonly entry: HistoryEntry;
      /** The cursor is at this entry — the canvas is showing it now. */
      readonly isCurrent: boolean;
      /** Past the cursor — a redoable ("future") step. */
      readonly isFuture: boolean;
    };

/**
 * Build the unified History timeline: durable on-disk snapshots interleaved
 * with the active page's in-memory undo entries, newest first. The undo
 * entries give per-edit granularity between the coarser snapshots without
 * extra disk writes. The synthetic `load` baseline entry is omitted (it's
 * not a user action). `cursor` is the undo entry the canvas is currently at
 * (`-1` = none); entries past it are redoable. See docs/notes/snapshots.md.
 */
export const mergeHistoryTimeline = (
  snapshots: ReadonlyArray<SnapshotMeta>,
  undoEntries: ReadonlyArray<HistoryEntry>,
  cursor: number
): TimelineItem[] => {
  const items: TimelineItem[] = [];

  for (const snapshot of snapshots) {
    items.push({ kind: 'snapshot', ts: Date.parse(snapshot.timestamp), snapshot });
  }

  undoEntries.forEach((entry, index) => {
    if (entry.kind === 'load') return;
    items.push({
      kind: 'undo',
      ts: entry.timestamp,
      index,
      entry,
      isCurrent: index === cursor,
      isFuture: index > cursor,
    });
  });

  // Newest first. Tie-break: a snapshot shares its moment with the undo
  // entry it was taken at — show the durable checkpoint above.
  return items.sort((a, b) => {
    if (b.ts !== a.ts) return b.ts - a.ts;
    if (a.kind === b.kind) return 0;
    return a.kind === 'snapshot' ? -1 : 1;
  });
};
