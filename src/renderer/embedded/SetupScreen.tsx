import { useEffect, useState } from 'react';

import type { EmbeddedCheck } from '@shared/types';

import { CheckRow } from './CheckRow';
import { useEmbeddedStore } from './embeddedStore';
import { refreshGit } from './session';
import styles from './SetupScreen.module.css';

const GROUPS: Array<{ id: EmbeddedCheck['group']; title: string }> = [
  { id: 'accounts', title: 'Accounts' },
  { id: 'environment', title: 'Environment' },
  { id: 'project', title: 'What Scamp will do' },
];

const PHASE_TEXT: Record<string, string> = {
  branch: 'Creating your branch…',
  configure: 'Configuring element mapping…',
  installing: 'Installing packages…',
  starting: 'Starting the dev server…',
};

/** Before anything runs: what passed, what needs attention, and what Start will do. */
export const SetupScreen = (): JSX.Element => {
  const preflight = useEmbeddedStore((s) => s.preflight);
  const starting = useEmbeddedStore((s) => s.starting);
  const startLog = useEmbeddedStore((s) => s.startLog);
  const startError = useEmbeddedStore((s) => s.startError);
  const set = useEmbeddedStore((s) => s.set);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      window.scampEmbedded.onStartProgress((p) => {
        if (p.kind === 'phase') setPhase(p.phase);
        else useEmbeddedStore.setState((s) => ({ startLog: (s.startLog + p.text).slice(-6000) }));
      }),
    []
  );

  const recheck = async (): Promise<void> => {
    const report = await window.scampEmbedded.preflight();
    if ('error' in report) setError(report.error);
    else set({ preflight: report });
  };

  const handleFix = async (fix: NonNullable<EmbeddedCheck['fix']>, value?: string): Promise<void> => {
    setError(null);
    if (fix === 'git-init') {
      const result = await window.scampEmbedded.gitInit();
      if (!result.ok) setError(result.error);
    } else if (fix === 'sign-in') {
      await window.scampEmbedded.signIn();
    } else if (fix === 'connect-agent' && value !== undefined) {
      const result = await window.scampEmbedded.setAgentKey(value.trim());
      if (!result.ok) setError(result.message);
    }
    await recheck();
  };

  const handleStart = async (): Promise<void> => {
    set({ starting: true, startError: null, startLog: '' });
    const result = await window.scampEmbedded.start();
    if (!result.ok) {
      set({ starting: false, startError: result.error });
      return;
    }
    set({ starting: false, url: result.url, branch: result.branch, screen: 'editor' });
    void refreshGit();
  };

  if (preflight === null) return <div className={styles.screen} />;
  return (
    <div className={styles.screen}>
      <div className={styles.column}>
        <div className={styles.head}>
          <h1 className={styles.title}>Set up {preflight.name}</h1>
          <p className={styles.folder}>{preflight.folder}</p>
        </div>
        {GROUPS.map((group) => {
          const checks = preflight.checks.filter((c) => c.group === group.id);
          if (checks.length === 0) return null;
          return (
            <section key={group.id} className={styles.group}>
              <h2 className={styles.groupTitle}>{group.title}</h2>
              <ul className={styles.list}>
                {checks.map((check) => (
                  <CheckRow key={check.id} check={check} onFix={handleFix} />
                ))}
              </ul>
            </section>
          );
        })}
        {error !== null && <p className={styles.error}>{error}</p>}
        {startError !== null && <p className={styles.error} data-testid="embedded-start-error">{startError}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={() => void recheck()} disabled={starting}>
            Check again
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => void handleStart()}
            disabled={!preflight.canStart || starting}
            data-testid="embedded-start"
          >
            {starting ? (phase !== null ? PHASE_TEXT[phase] ?? 'Starting…' : 'Starting…') : 'Start'}
          </button>
        </div>
        {(starting || startError !== null) && startLog.length > 0 && (
          <details className={styles.log} open={startError !== null}>
            <summary>Output</summary>
            <pre>{startLog}</pre>
          </details>
        )}
      </div>
    </div>
  );
};
