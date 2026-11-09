import { useEffect, useState } from 'react';
import {
  IconArrowBackUp,
  IconBolt,
  IconBookmark,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  type Icon,
} from '@tabler/icons-react';

import type { ScampElement } from '@lib/element';
import type { SnapshotMeta } from '@shared/types';
import { useSnapshotsStore } from '@store/snapshotsSlice';
import { useCanvasStore } from '@store/canvasSlice';
import { selectActivePageHistory, useHistoryStore } from '@store/historySlice';
import type { HistoryEntry } from '@store/historyTypes';
import {
  formatPageCount,
  mergeHistoryTimeline,
  triggerIcon,
  type TriggerIcon,
} from '@store/snapshotDisplay';
import { formatHistoryLabel, formatRelativeTime } from '@store/formatHistoryLabel';

import { Tooltip } from './controls/Tooltip';
import { Button } from './controls/Button';
import styles from './HistoryPanel.module.css';

type Props = {
  /** Active project root — snapshots are scoped to it. */
  projectPath: string;
};

const TRIGGER_ICON: Record<TriggerIcon, Icon> = {
  'session-open': IconPlayerPlay,
  'session-close': IconPlayerStop,
  agent: IconBolt,
  manual: IconBookmark,
  auto: IconRefresh,
  restore: IconArrowBackUp,
};

/**
 * The History panel — the second tab in the left sidebar. Shows a unified,
 * newest-first timeline (with a "Now" marker) that interleaves the
 * project's durable on-disk snapshots with the active page's in-memory
 * undo entries, so users get per-edit granularity between the coarser
 * snapshots without extra disk writes. Clicking a snapshot restores it
 * from disk (after confirming); clicking an undo entry jumps the canvas to
 * that point in-session (current page, no disk write). "Save snapshot"
 * takes a manual one. See docs/notes/snapshots.md.
 */
export const HistoryPanel = ({ projectPath }: Props): JSX.Element => {
  const snapshots = useSnapshotsStore((s) => s.snapshots);
  const loadSnapshots = useSnapshotsStore((s) => s.loadSnapshots);
  const takeSnapshot = useSnapshotsStore((s) => s.takeSnapshot);
  const previewSnapshot = useSnapshotsStore((s) => s.previewSnapshot);

  // In-session undo stack (active page only) — interleaved with snapshots.
  const history = useHistoryStore(selectActivePageHistory);
  const transactionDepth = useHistoryStore((s) => s.transactionDepth);
  const jumpToHistory = useHistoryStore((s) => s.jumpToHistory);
  const elements = useCanvasStore((s) => s.elements);
  const isPreviewing = useCanvasStore((s) => s.snapshotPreview !== null);
  // Suppress undo jumps mid-drag, and while previewing a snapshot (the
  // canvas is showing snapshot content, not the live undo state).
  const isDragging = transactionDepth > 0;

  // Refresh the list every time the panel mounts (i.e. the tab is opened)
  // so agent-edit / auto-save snapshots taken while it was hidden appear.
  useEffect(() => {
    void loadSnapshots(projectPath);
  }, [loadSnapshots, projectPath]);

  // 30s tick keeps relative timestamps fresh ("just now" → "1 min ago").
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const now = Date.now();

  // Manual-snapshot naming state.
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const handleSaveSnapshot = (): void => {
    void takeSnapshot(projectPath, 'manual', name.trim() || undefined);
    setName('');
    setNaming(false);
  };

  const timeline = mergeHistoryTimeline(snapshots, history.entries, history.cursor);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        {naming ? (
          <input
            className={styles.nameInput}
            autoFocus
            value={name}
            placeholder="Snapshot name (optional)"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveSnapshot();
              if (e.key === 'Escape') {
                setNaming(false);
                setName('');
              }
            }}
            onBlur={() => {
              setNaming(false);
              setName('');
            }}
          />
        ) : (
          <Button
            variant="secondary"
            fullWidth
            disabled={isPreviewing}
            onClick={() => setNaming(true)}
          >
            Save snapshot
          </Button>
        )}
      </div>

      <ul className={styles.list}>
        <li className={`${styles.row} ${styles.nowRow}`}>
          {isPreviewing ? (
            // While previewing, "Now" is the way back to the live state.
            <button
              type="button"
              className={`${styles.rowButton} ${styles.nowExit}`}
              onClick={() => useCanvasStore.getState().exitSnapshotPreview()}
              title="Exit preview and return to the current state"
            >
              <span className={styles.bullet} aria-hidden="true">
                ●
              </span>
              <span className={styles.label}>Now</span>
            </button>
          ) : (
            <div className={styles.rowButton}>
              <span className={styles.bullet} aria-hidden="true">
                ●
              </span>
              <span className={styles.label}>Now</span>
            </div>
          )}
        </li>

        {timeline.length === 0 ? (
          <li>
            <p className={styles.empty}>No history yet</p>
          </li>
        ) : (
          timeline.map((item) =>
            item.kind === 'snapshot' ? (
              <SnapshotRow
                key={`s-${item.snapshot.id}`}
                snapshot={item.snapshot}
                now={now}
                onSelect={() => void previewSnapshot(projectPath, item.snapshot)}
              />
            ) : (
              <UndoRow
                key={`u-${item.entry.id}`}
                entry={item.entry}
                elements={elements}
                now={now}
                isCurrent={item.isCurrent}
                isFuture={item.isFuture}
                onJump={
                  isDragging || isPreviewing || item.isCurrent
                    ? undefined
                    : () => jumpToHistory(item.index)
                }
              />
            )
          )
        )}
      </ul>
    </div>
  );
};

type RowProps = {
  snapshot: SnapshotMeta;
  now: number;
  /** Enter a read-only preview of this snapshot on the canvas. */
  onSelect: () => void;
};

const SnapshotRow = ({ snapshot, now, onSelect }: RowProps): JSX.Element => {
  const Icon = TRIGGER_ICON[triggerIcon(snapshot.trigger)];
  const ts = Date.parse(snapshot.timestamp);
  const relative = formatRelativeTime(ts, now);
  const absolute = new Date(ts).toLocaleString();

  return (
    <li className={styles.row}>
      <Tooltip label={absolute}>
        <button type="button" className={styles.rowButton} onClick={onSelect}>
          <span className={styles.icon} aria-hidden="true">
            <Icon size={14} />
          </span>
          <span className={styles.label}>
            {snapshot.label}
            <span className={styles.secondary}>
              {' · '}
              {formatPageCount(snapshot.pageCount)}
            </span>
          </span>
          <span className={styles.timestamp}>{relative}</span>
        </button>
      </Tooltip>
    </li>
  );
};

type UndoRowProps = {
  entry: HistoryEntry;
  elements: Record<string, ScampElement>;
  now: number;
  isCurrent: boolean;
  isFuture: boolean;
  /** Undefined when the row isn't actionable (current entry, or mid-drag). */
  onJump?: () => void;
};

const UndoRow = ({
  entry,
  elements,
  now,
  isCurrent,
  isFuture,
  onJump,
}: UndoRowProps): JSX.Element => {
  const label = formatHistoryLabel(entry, elements);
  const relative = formatRelativeTime(entry.timestamp, now);
  const absolute = new Date(entry.timestamp).toLocaleTimeString();
  const rowClass = [
    styles.row,
    styles.undoRow,
    isCurrent ? styles.current : '',
    isFuture ? styles.future : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={rowClass}>
      <Tooltip label={absolute}>
        <button
          type="button"
          className={styles.rowButton}
          onClick={onJump}
          disabled={onJump === undefined}
        >
          <span className={styles.tick} aria-hidden="true">
            │
          </span>
          <span className={styles.label}>{label}</span>
          <span className={styles.timestamp}>{relative}</span>
        </button>
      </Tooltip>
    </li>
  );
};
