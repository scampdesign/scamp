import { useEffect, useState } from 'react';

import type { EmbeddedRecentProject } from '@shared/types';

import { useEmbeddedStore } from './embeddedStore';
import styles from './ChooseScreen.module.css';

type Recent = EmbeddedRecentProject & { exists: boolean };

const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

/** The first screen: a recent project, or a new folder. */
export const ChooseScreen = (): JSX.Element => {
  const set = useEmbeddedStore((s) => s.set);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);

  useEffect(() => {
    let cancelled = false;
    void window.scampEmbedded.recent().then((list) => {
      if (!cancelled) setRecent(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const openFolder = async (folder: string): Promise<void> => {
    setError(null);
    setBusy(true);
    const report = await window.scampEmbedded.open(folder);
    setBusy(false);
    if ('error' in report) {
      setError(report.error);
      return;
    }
    set({ folder, preflight: report, screen: 'setup' });
  };

  const handleChoose = async (): Promise<void> => {
    const chosen = await window.scampEmbedded.chooseFolder();
    if (chosen.kind === 'ok') await openFolder(chosen.folder);
  };

  const handleForget = async (folder: string): Promise<void> => {
    await window.scampEmbedded.forgetRecent(folder);
    setRecent((list) => list.filter((p) => p.folder !== folder));
  };

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <h1 className={styles.title}>Edit a React project</h1>
        <p className={styles.lede}>
          Choose a Vite + React or Next.js project on your computer. Scamp runs it, and you restyle the real app with the
          Scamp panel. The Scamp Agent writes each change into your source, on its own git branch.
        </p>
        <button type="button" className={styles.primary} onClick={handleChoose} disabled={busy} data-testid="embedded-choose">
          {busy ? 'Checking the project…' : 'Choose project folder'}
        </button>
        {error !== null && <p className={styles.error}>{error}</p>}
        {recent.length > 0 && (
          <section className={styles.recent} aria-labelledby="embedded-recent-title">
            <h2 id="embedded-recent-title" className={styles.recentTitle}>
              Recent
            </h2>
            <ul className={styles.recentList} data-testid="embedded-recent">
              {recent.map((p) => (
                <li key={p.folder} className={styles.recentRow}>
                  <button
                    type="button"
                    className={styles.recentOpen}
                    onClick={() => void openFolder(p.folder)}
                    disabled={busy || !p.exists}
                    title={p.exists ? p.folder : `${p.folder} isn’t there any more`}
                  >
                    <span className={styles.recentName}>{p.name}</span>
                    <span className={styles.recentPath}>{p.exists ? p.folder : 'Folder not found'}</span>
                  </button>
                  <span className={styles.recentDate}>{shortDate.format(new Date(p.lastOpened))}</span>
                  <button type="button" className={styles.recentForget} onClick={() => void handleForget(p.folder)} aria-label={`Remove ${p.name} from the list`}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
};
