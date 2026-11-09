import { useEffect, useState } from 'react';

import type { EmbeddedHistoryEntry } from '@shared/types';
import { formatRelativeTime } from '@store/formatHistoryLabel';

import { useEmbeddedStore } from './embeddedStore';
import { goToHistory, refreshGit, refreshHistory } from './session';
import styles from './HistoryList.module.css';

const exact = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

type RowProps = {
  label: string;
  details: string[];
  time: number | null;
  files: string[];
  current: boolean;
  undone: boolean;
  now: number;
  disabled: boolean;
  onGo: () => void;
};

const Row = ({ label, details, time, files, current, undone, now, disabled, onGo }: RowProps): JSX.Element => (
  <li className={styles.row} data-current={current} data-undone={undone}>
    <button type="button" className={styles.go} onClick={onGo} disabled={disabled || current} aria-current={current ? 'step' : undefined} data-testid="embedded-history-entry">
      <span className={styles.label}>{label}</span>
      {details.length > 0 && (
        <ul className={styles.details}>
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      <span className={styles.meta}>
        {time !== null && <span title={exact.format(new Date(time * 1000))}>{formatRelativeTime(time * 1000, now)}</span>}
        {files.length > 0 && <span title={files.join('\n')}>{files.length === 1 ? files[0] : `${files.length} files`}</span>}
      </span>
    </button>
  </li>
);

/**
 * Scamp's changes on this branch as a timeline, like the canvas's History
 * panel: oldest first, the project's current point marked, and the steps
 * gone back past dimmed below a divider. Click any entry to go there.
 * see docs/plans/embedded-canvas-gaps.md (P3)
 */
export const HistoryList = ({ active }: { active: boolean }): JSX.Element | null => {
  const history = useEmbeddedStore((s) => s.history);
  const phase = useEmbeddedStore((s) => s.agent.phase);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<{ sha: string; error: string; canRevert: boolean } | null>(null);

  useEffect(() => {
    if (active) void refreshHistory();
  }, [active, phase]);
  // Keep "3 min ago" current.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (history === null || history.entries.length === 0) return null;

  const handleGo = async (sha: string): Promise<void> => {
    setBusy(true);
    setBlocked(null);
    const result = await goToHistory(sha);
    setBusy(false);
    if (!result.ok) setBlocked({ sha, error: result.error, canRevert: result.code === 'pushed' });
  };

  const handleRevert = async (sha: string): Promise<void> => {
    setBusy(true);
    const result = await window.scampEmbedded.revert(sha);
    setBusy(false);
    setBlocked(result.ok ? null : { sha, error: result.error, canRevert: false });
    await Promise.all([refreshHistory(), refreshGit()]);
  };

  const oldestFirst: EmbeddedHistoryEntry[] = [...history.entries].reverse();
  const firstUndone = oldestFirst.findIndex((e) => e.undone);
  return (
    <section className={styles.history} aria-labelledby="embedded-history-title">
      <h3 id="embedded-history-title" className={styles.title}>
        History
      </h3>
      <ol className={styles.list} data-testid="embedded-history">
        {history.base !== null && (
          <Row
            label="Session start"
            details={[]}
            time={null}
            files={[]}
            current={history.atBase}
            undone={false}
            now={now}
            disabled={busy}
            onGo={() => void handleGo(history.base ?? '')}
          />
        )}
        {oldestFirst.map((entry, i) => (
          <HistoryRow key={entry.sha} entry={entry} divider={i === firstUndone} now={now} busy={busy} onGo={handleGo} />
        ))}
      </ol>
      {blocked !== null && (
        <div className={styles.blocked} role="status" data-testid="embedded-history-blocked">
          <p>{blocked.error}</p>
          {blocked.canRevert && (
            <button type="button" className={styles.revert} disabled={busy} onClick={() => void handleRevert(blocked.sha)}>
              Revert this change instead
            </button>
          )}
        </div>
      )}
    </section>
  );
};

type HistoryRowProps = { entry: EmbeddedHistoryEntry; divider: boolean; now: number; busy: boolean; onGo: (sha: string) => Promise<void> };

const HistoryRow = ({ entry, divider, now, busy, onGo }: HistoryRowProps): JSX.Element => {
  // A commit Scamp made lists its changes; any other shows its subject.
  const scamp = entry.subject.startsWith('Scamp: ');
  const label = entry.changes.length > 0 ? (entry.changes[0] ?? '') : scamp ? entry.subject.slice('Scamp: '.length) : entry.subject;
  return (
    <>
      {divider && (
        <li className={styles.divider} aria-hidden="true">
          Undone
        </li>
      )}
      <Row
        label={label}
        details={entry.changes.slice(1)}
        time={entry.time}
        files={entry.files}
        current={entry.current}
        undone={entry.undone}
        now={now}
        disabled={busy}
        onGo={() => void onGo(entry.sha)}
      />
    </>
  );
};
