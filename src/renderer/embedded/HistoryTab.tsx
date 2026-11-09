import { useEffect, useState } from 'react';

import type { EmbeddedGitResult } from '@shared/types';

import { DiffView } from './DiffView';
import { HistoryList } from './HistoryList';
import { useEmbeddedStore } from './embeddedStore';
import { dropRunEntries, redo, refreshGit, refreshHistory, runInspector, undo } from './session';
import styles from './Tabs.module.css';

// Mac or not, for the shortcut the buttons name.
const MOD = navigator.userAgent.includes('Macintosh') ? '⌘' : 'Ctrl+';

/** Everything already done: undo and redo, the agent's changes to review, what was accepted, and git. */
export const HistoryTab = (): JSX.Element => {
  const agent = useEmbeddedStore((s) => s.agent);
  const git = useEmbeddedStore((s) => s.git);
  const notice = useEmbeddedStore((s) => s.notice);
  const undoSteps = useEmbeddedStore((s) => s.undo);
  const redoSteps = useEmbeddedStore((s) => s.redo);
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
    await Promise.all([refreshGit(), refreshHistory()]);
  };

  return (
    <div className={styles.tab}>
      {git !== null && (
        <section className={styles.section} data-testid="embedded-branch-section">
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
      <section className={styles.section}>
        <h3 className={styles.title}>Undo</h3>
        <div className={styles.row}>
          <button type="button" className={styles.button} onClick={() => void undo()} data-testid="embedded-undo">
            Undo <span className={styles.key}>{MOD}Z</span>
          </button>
          <button type="button" className={styles.button} onClick={() => void redo()} data-testid="embedded-redo">
            Redo <span className={styles.key}>{MOD}⇧Z</span>
          </button>
        </div>
        {undoSteps.length + redoSteps.length === 0 ? (
          <p className={styles.empty}>Your edits and the agent&rsquo;s runs since the last Accept appear here. Past them, undo goes back through the history.</p>
        ) : (
          <ol className={styles.list} data-testid="embedded-undo-steps">
            {[...redoSteps].map((step, i) => (
              <li key={`r${i}`} className={styles.item} data-undone="true">
                <span className={styles.itemText}>{step.label}</span>
              </li>
            ))}
            {[...undoSteps].reverse().map((step, i) => (
              <li key={`u${i}`} className={styles.item} data-current={i === 0}>
                <span className={styles.itemText}>{step.kind === 'run' ? `Agent wrote: ${step.label}` : step.label}</span>
              </li>
            ))}
          </ol>
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
            <button
              type="button"
              className={styles.primary}
              disabled={busy || running}
              onClick={() =>
                void act(async () => {
                  const result = await window.scampEmbedded.accept(message);
                  // Committed: undo goes through the history from here.
                  if (result.ok) dropRunEntries();
                  return result;
                }, 'Committed.')
              }
              data-testid="embedded-accept"
            >
              Accept
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={busy || running}
              onClick={() =>
                void act(async () => {
                  const result = await window.scampEmbedded.discard();
                  if (result.ok) {
                    await runInspector({ type: 'clear' });
                    dropRunEntries();
                  }
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

      {notice !== null && <p className={styles.notice} data-testid="embedded-notice">{notice}</p>}

      <HistoryList active={true} />

    </div>
  );
};
