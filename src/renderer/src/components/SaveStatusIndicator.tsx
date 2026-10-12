import { useEffect, useMemo, useRef, useState } from 'react';
import { useSaveStatusStore, type SaveState } from '@store/saveStatusSlice';
import { useCanvasStore } from '@store/canvasSlice';
import { useHistoryStore } from '@store/historySlice';
import { useTerminalActivityStore } from '@store/terminalActivitySlice';
import { formatHistoryLabel } from '@store/formatHistoryLabel';
import {
  discardDivergedCanvas,
  resumeFromPause,
  retryLastSave,
  saveDivergedCanvas,
} from '../syncBridge';
import styles from './SaveStatusIndicator.module.css';

/** Cap on how many recent edits the diverged popover lists. Above
 *  this the popover would scroll; better to show "+ N more." */
const MAX_DIFF_ENTRIES = 5;

/**
 * Header indicator showing whether canvas edits are in sync with disk.
 * Driven by `useSaveStatusStore`. Seven states; in every state the
 * pill opens a popover that includes a manual Pause / Resume toggle
 * (this replaces the old standalone `SyncPauseToggle` button).
 *
 *   - saved          — canvas == disk. Popover offers Pause sync.
 *   - unsaved        — canvas has uncommitted edits, debounce pending.
 *                      Popover offers Pause sync.
 *   - saving         — write IPC in flight. Popover offers Pause sync.
 *   - error          — write failed. Popover shows the message and
 *                      Retry; also offers Pause sync.
 *   - paused         — sync engine intentionally suspended. Popover
 *                      explains why (manual /
 *                      external-edit) and offers Resume.
 *   - diverged       — pause cleared; canvas + disk don't match;
 *                      user picks Save canvas or Discard canvas.
 *   - reloaded-from-disk
 *                    — last write hit a conflict and Scamp adopted
 *                      disk; user's in-flight edit was discarded.
 */
export const SaveStatusIndicator = (): JSX.Element => {
  const state = useSaveStatusStore((s) => s.state);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  // Dismiss the popover on a click anywhere outside its host span.
  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e: MouseEvent): void => {
      if (
        wrapRef.current &&
        e.target instanceof Node &&
        !wrapRef.current.contains(e.target)
      ) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [popoverOpen]);

  const close = (): void => setPopoverOpen(false);

  return (
    <span ref={wrapRef} className={styles.wrap}>
      {renderPill(state, popoverOpen, () => setPopoverOpen((v) => !v))}
      {popoverOpen && (
        <span className={styles.popover} role="dialog">
          {renderPopover(state, close)}
        </span>
      )}
    </span>
  );
};

const renderPill = (
  state: SaveState,
  expanded: boolean,
  onClick: () => void
): JSX.Element => {
  const variant = pillVariantFor(state);
  return (
    <button
      type="button"
      className={`${styles.indicator} ${styles[variant.styleKey]} ${styles.button}`}
      aria-live={variant.ariaLive}
      aria-expanded={expanded}
      data-testid="save-status"
      data-status={variant.dataStatus}
      onClick={onClick}
    >
      <span
        className={`${styles.glyph} ${variant.spin ? styles.spinner : ''}`}
        aria-hidden="true"
      >
        {variant.glyph}
      </span>
      {variant.label}
      {state.kind === 'error' && (
        <span className={styles.errorMessage} title={state.message}>
          {/* keep the title attribute the source of truth for the
           *  detailed message; the pill keeps its short label. */}
        </span>
      )}
    </button>
  );
};

type PillVariant = {
  styleKey:
    | 'saved'
    | 'saving'
    | 'unsaved'
    | 'error'
    | 'paused'
    | 'diverged'
    | 'reloaded';
  dataStatus: string;
  ariaLive: 'polite' | 'assertive';
  glyph: string;
  label: string;
  spin: boolean;
};

const pillVariantFor = (state: SaveState): PillVariant => {
  switch (state.kind) {
    case 'saved':
      return {
        styleKey: 'saved',
        dataStatus: 'saved',
        ariaLive: 'polite',
        glyph: '✓',
        label: 'Saved',
        spin: false,
      };
    case 'saving':
      return {
        styleKey: 'saving',
        dataStatus: 'saving',
        ariaLive: 'polite',
        glyph: '↑',
        label: 'Saving…',
        spin: true,
      };
    case 'unsaved':
      return {
        styleKey: 'unsaved',
        dataStatus: 'unsaved',
        ariaLive: 'polite',
        glyph: '●',
        label: 'Unsaved',
        spin: false,
      };
    case 'error':
      return {
        styleKey: 'error',
        dataStatus: 'error',
        ariaLive: 'assertive',
        glyph: '⚠',
        label: 'Save failed',
        spin: false,
      };
    case 'paused':
      return {
        styleKey: 'paused',
        dataStatus: 'paused',
        ariaLive: 'polite',
        glyph: '⏸',
        label: 'Paused',
        spin: false,
      };
    case 'diverged':
      return {
        styleKey: 'diverged',
        dataStatus: 'diverged',
        ariaLive: 'assertive',
        glyph: '⚠',
        label: 'Diverged',
        spin: false,
      };
    case 'reloaded-from-disk':
      return {
        styleKey: 'reloaded',
        dataStatus: 'reloaded-from-disk',
        ariaLive: 'polite',
        glyph: '↺',
        label: 'Reloaded',
        spin: false,
      };
  }
};

/**
 * Manual Pause / Resume control — present in EVERY popover variant.
 * This is the merged-in `SyncPauseToggle` UI: rather than a separate
 * toolbar button, the user opens the save-indicator dropdown and the
 * toggle lives there. Resume also ends a pause an external edit opened.
 */
const ManualToggle = ({ onAction }: { onAction: () => void }): JSX.Element => {
  const intent = useTerminalActivityStore((s) => s.userIntent);
  const setUserIntent = useTerminalActivityStore((s) => s.setUserIntent);
  const state = useSaveStatusStore((s) => s.state);

  // Show Resume when the bridge is currently paused (whatever the
  // reason), or when the user already manually paused. Otherwise show
  // Pause.
  const showResume = intent === 'paused' || state.kind === 'paused';
  const label = showResume ? 'Resume sync' : 'Pause sync';

  const handleClick = (): void => {
    if (!showResume) {
      setUserIntent('paused');
    } else if (intent === 'paused') {
      setUserIntent('auto');
    } else {
      resumeFromPause();
    }
    onAction();
  };

  return (
    <button
      type="button"
      className={styles.popoverButton}
      onClick={handleClick}
      data-testid="manual-sync-toggle"
    >
      {label}
    </button>
  );
};

/**
 * Diverged-state popover. Splits out into its own component because
 * it needs `useHistoryStore` / `useCanvasStore` subscriptions — the
 * other popover branches are stateless. Lists the canvas edits that
 * happened DURING the pause so the user can decide between Save
 * canvas and Discard canvas with a clear picture of what's at stake.
 */
const DivergedPopoverBody = ({
  onAction,
}: {
  onAction: () => void;
}): JSX.Element => {
  const pauseStartedAt = useSaveStatusStore((s) => s.pauseStartedAt);
  const activePageId = useHistoryStore((s) => s.activePageId);
  const pageHistory = useHistoryStore((s) =>
    activePageId ? s.perPage[activePageId] : undefined
  );
  const elements = useCanvasStore((s) => s.elements);

  const recentEntries = useMemo(() => {
    if (!pageHistory) return [];
    const since = pauseStartedAt ?? 0;
    return pageHistory.entries.filter((e) => e.timestamp >= since);
  }, [pageHistory, pauseStartedAt]);

  const visible = recentEntries.slice(-MAX_DIFF_ENTRIES).reverse();
  const overflow = Math.max(0, recentEntries.length - visible.length);

  return (
    <>
      <p className={styles.popoverBody}>
        Your canvas changes haven&apos;t been saved because the file was
        edited externally. Choose which version to keep.
      </p>
      {visible.length > 0 && (
        <div className={styles.divergedDiff}>
          <div className={styles.divergedDiffHeader}>
            Canvas changes since the pause:
          </div>
          <ul className={styles.divergedDiffList}>
            {visible.map((entry) => (
              <li key={entry.id}>{formatHistoryLabel(entry, elements)}</li>
            ))}
            {overflow > 0 && (
              <li className={styles.divergedDiffOverflow}>
                + {overflow} more
              </li>
            )}
          </ul>
        </div>
      )}
      <div className={styles.popoverActions}>
        <button
          type="button"
          className={styles.popoverButton}
          onClick={() => {
            saveDivergedCanvas();
            onAction();
          }}
        >
          Save canvas
        </button>
        <button
          type="button"
          className={styles.popoverButton}
          onClick={() => {
            discardDivergedCanvas();
            onAction();
          }}
        >
          Discard canvas
        </button>
      </div>
    </>
  );
};

const renderPopover = (
  state: SaveState,
  close: () => void
): JSX.Element | null => {
  // Diverged has its own full body (Save canvas / Discard canvas) and
  // doesn't get the manual toggle — Save/Discard is the user's choice
  // at this moment, pausing isn't useful here.
  if (state.kind === 'diverged') {
    return <DivergedPopoverBody onAction={close} />;
  }

  const bodyCopy = popoverBodyCopyFor(state);
  return (
    <>
      {bodyCopy}
      <div className={styles.popoverDivider} />
      <div className={styles.popoverActions}>
        <ManualToggle onAction={close} />
      </div>
    </>
  );
};

const popoverBodyCopyFor = (state: SaveState): JSX.Element => {
  if (state.kind === 'paused') {
    const message =
      state.reason === 'manual'
        ? "Sync is paused — you've paused saving manually. Edits save when you leave the page or resume."
        : 'Sync paused — an external editor is writing to project files. Canvas edits will queue until activity settles.';
    return <p className={styles.popoverBody}>{message}</p>;
  }
  if (state.kind === 'reloaded-from-disk') {
    return (
      <p className={styles.popoverBody}>
        <code>{state.file}</code> was edited externally while Scamp was
        saving. The canvas was reloaded from disk; any in-flight edit was
        dropped.
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <p className={styles.popoverBody}>
        Save failed: <code>{state.message}</code>
        <br />
        <button
          type="button"
          className={styles.retryButton}
          onClick={() => retryLastSave()}
        >
          Retry
        </button>
      </p>
    );
  }
  if (state.kind === 'saving') {
    return (
      <p className={styles.popoverBody}>
        Writing canvas edits to disk…
      </p>
    );
  }
  if (state.kind === 'unsaved') {
    return (
      <p className={styles.popoverBody}>
        Canvas has unsaved edits. Scamp will write them to disk shortly.
      </p>
    );
  }
  // saved
  return (
    <p className={styles.popoverBody}>
      Canvas is in sync with project files on disk.
    </p>
  );
};
