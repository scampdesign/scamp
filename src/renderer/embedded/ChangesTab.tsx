import { useEffect, useState } from 'react';

import type { EmbeddedGitResult, EmbeddedQueueItem } from '@shared/types';

import { DiffView } from './DiffView';
import { useEmbeddedStore } from './embeddedStore';
import { refreshGit, runInspector } from './session';
import styles from './ChangesTab.module.css';

const summary = (item: EmbeddedQueueItem): string =>
  item.kind === 'style'
    ? `<${item.element.tag}${item.state !== undefined ? `:${item.state}` : ''}> ${item.changes.map((c) => `${c.property} → ${c.to}`).join(', ')}${item.scope === 'all' ? ' (all)' : ''}`
    : item.text;

/** The agent's queue and controls, review of what it wrote, and git. */
export const ChangesTab = (): JSX.Element => {
  const agent = useEmbeddedStore((s) => s.agent);
  const git = useEmbeddedStore((s) => s.git);
  const log = useEmbeddedStore((s) => s.agentLog);
  const notice = useEmbeddedStore((s) => s.notice);
  const set = useEmbeddedStore((s) => s.set);
  const [diff, setDiff] = useState('');
  const [message, setMessage] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [busy, setBusy] = useState(false);
  const files = git?.agentFiles ?? [];
  const running = agent.phase === 'thinking' || agent.phase === 'writing';

  useEffect(() => {
    void refreshGit();
  }, []);
  // Re-read whenever the set of files the agent wrote changes, or a run ends.
  const fileKey = files.join('\n');
  const phase = agent.phase;
  useEffect(() => {
    if (fileKey.length === 0) {
      setDiff('');
      return;
    }
    void window.scampEmbedded.gitDiff(fileKey.split('\n')).then(setDiff);
  }, [fileKey, phase]);
  useEffect(() => {
    if (agent.lastText.length > 0) setMessage(agent.lastText.split('\n')[0]?.slice(0, 100) ?? '');
  }, [agent.lastText]);

  const act = async (fn: () => Promise<EmbeddedGitResult>, done?: string): Promise<void> => {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    set({ notice: result.ok ? (result.message ?? done ?? null) : result.error });
    await refreshGit();
  };

  return (
    <div className={styles.tab}>
      <section className={styles.section}>
        <h3 className={styles.title}>Agent</h3>
        <div className={styles.row}>
          <button
            type="button"
            className={styles.button}
            aria-pressed={agent.paused}
            onClick={() => void window.scampEmbedded.setPaused(!agent.paused)}
            data-testid="embedded-pause"
          >
            {agent.paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={agent.queued.length === 0 || running}
            onClick={() => void window.scampEmbedded.runNow()}
            data-testid="embedded-run-now"
          >
            Run now
          </button>
          {running && (
            <button type="button" className={styles.button} onClick={() => void window.scampEmbedded.cancel()}>
              Stop
            </button>
          )}
        </div>
        {agent.message !== undefined && <p className={styles.note}>{agent.message}</p>}
        {agent.queued.length === 0 ? (
          <p className={styles.empty}>{agent.paused ? 'Paused. Edits wait here until you resume or run them.' : 'Edits you make go to the agent here.'}</p>
        ) : (
          <ul className={styles.list} data-testid="embedded-queue">
            {agent.queued.map((item) => (
              <li key={item.id} className={styles.item}>
                <span className={styles.itemText}>{summary(item)}</span>
                <button type="button" className={styles.remove} onClick={() => void window.scampEmbedded.removeQueued(item.id)} aria-label="Remove from queue">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {files.length > 0 && (
        <section className={styles.section} data-testid="embedded-review">
          <h3 className={styles.title}>Review the agent&rsquo;s changes</h3>
          <ul className={styles.files}>
            {files.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {diff.length > 0 && <DiffView diff={diff} />}
          <input className={styles.input} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Commit message" aria-label="Commit message" />
          <div className={styles.row}>
            <button type="button" className={styles.primary} disabled={busy || running} onClick={() => void act(() => window.scampEmbedded.accept(message), 'Committed.')} data-testid="embedded-accept">
              Accept
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={busy || running}
              onClick={() =>
                void act(async () => {
                  const result = await window.scampEmbedded.discard();
                  if (result.ok) await runInspector({ type: 'clear' });
                  return result;
                }, 'Discarded.')
              }
              data-testid="embedded-discard"
            >
              Discard
            </button>
          </div>
        </section>
      )}

      {git !== null && (
        <section className={styles.section}>
          <h3 className={styles.title}>Branch</h3>
          <div className={styles.row}>
            <select
              className={styles.select}
              value={git.branch}
              onChange={(e) => void act(() => window.scampEmbedded.switchBranch(e.target.value, false), 'Switched.')}
              aria-label="Switch branch"
              disabled={busy}
            >
              {git.branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <form
            className={styles.row}
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => window.scampEmbedded.switchBranch(newBranch.trim(), true), 'Branch created.').then(() => setNewBranch(''));
            }}
          >
            <input className={styles.input} value={newBranch} onChange={(e) => setNewBranch(e.target.value)} placeholder="new-branch-name" aria-label="New branch name" />
            <button type="submit" className={styles.button} disabled={busy || newBranch.trim().length === 0}>
              Create
            </button>
          </form>
          <div className={styles.row}>
            <button type="button" className={styles.button} disabled={busy || !git.hasRemote} onClick={() => void act(() => window.scampEmbedded.push())} data-testid="embedded-push">
              Push{git.ahead > 0 ? ` (${git.ahead})` : ''}
            </button>
            <button type="button" className={styles.button} disabled={busy || !git.hasRemote} onClick={() => void act(() => window.scampEmbedded.pull())} data-testid="embedded-pull">
              Pull{git.behind > 0 ? ` (${git.behind})` : ''}
            </button>
          </div>
          {!git.hasRemote && <p className={styles.note}>Add a remote named origin to push and pull.</p>}
        </section>
      )}

      {notice !== null && <p className={styles.notice} data-testid="embedded-notice">{notice}</p>}

      {git !== null && git.scampCommits.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.title}>Scamp&rsquo;s commits</h3>
          <ul className={styles.list} data-testid="embedded-commits">
            {git.scampCommits.map((c) => (
              <li key={c.sha} className={styles.item}>
                <span className={styles.itemText}>{c.subject}</span>
                <button type="button" className={styles.button} disabled={busy} onClick={() => void act(() => window.scampEmbedded.revert(c.sha), 'Reverted.')}>
                  Revert
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {log.length > 0 && (
        <details className={styles.log}>
          <summary>Agent log</summary>
          {log.map((entry, i) => (
            <p key={i} className={styles.logLine} data-kind={entry.kind} data-ok={entry.ok === false ? 'false' : 'true'}>
              {entry.text}
            </p>
          ))}
        </details>
      )}
    </div>
  );
};
