import { useEffect, useState, type FormEvent } from 'react';

import type { EmbeddedRecentProject } from '@shared/types';

import { Tooltip } from '../src/components/controls/Tooltip';
import { useEmbeddedStore } from './embeddedStore';
import styles from './ChooseScreen.module.css';

type Recent = EmbeddedRecentProject & { exists: boolean };

const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

/** The first screen: a recent project, a React project for Scamp to run, or an app already running. */
export const ChooseScreen = (): JSX.Element => {
  const set = useEmbeddedStore((s) => s.set);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [address, setAddress] = useState('');

  useEffect(() => {
    let cancelled = false;
    void window.scampEmbedded.recent().then((list) => {
      if (!cancelled) setRecent(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const openFolder = async (folder: string, url?: string): Promise<void> => {
    setError(null);
    setBusy(true);
    const report = await window.scampEmbedded.open(folder, url);
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

  const handleAttach = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const chosen = await window.scampEmbedded.chooseFolder();
    if (chosen.kind === 'ok') await openFolder(chosen.folder, address.trim());
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
        <form className={styles.attach} onSubmit={(e) => void handleAttach(e)}>
          <h2 className={styles.attachTitle}>Or edit an app that’s already running</h2>
          <p className={styles.lede}>
            For a Rails app, or any app you start yourself. Enter its address, then choose the folder its code is in. Scamp
            loads the app as it runs and never starts or stops it.
          </p>
          <div className={styles.attachRow}>
            <input
              className={styles.address}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="localhost:3000"
              aria-label="The running app’s address"
              data-testid="embedded-attach-url"
            />
            <button type="submit" className={styles.secondary} disabled={busy || address.trim().length === 0} data-testid="embedded-attach">
              Choose its folder
            </button>
          </div>
        </form>
        {error !== null && <p className={styles.error}>{error}</p>}
        {recent.length > 0 && (
          <section className={styles.recent} aria-labelledby="embedded-recent-title">
            <h2 id="embedded-recent-title" className={styles.recentTitle}>
              Recent
            </h2>
            <ul className={styles.recentList} data-testid="embedded-recent">
              {recent.map((p) => (
                <li key={p.folder} className={styles.recentRow}>
                  <Tooltip label={p.exists ? p.folder : `${p.folder} isn’t there any more`}>
                    <button
                      type="button"
                      className={styles.recentOpen}
                      onClick={() => void openFolder(p.folder, p.url)}
                      disabled={busy || !p.exists}
                    >
                      <span className={styles.recentName}>{p.name}</span>
                      <span className={styles.recentPath}>
                        {p.exists ? (p.url === undefined ? p.folder : `${p.url} · ${p.folder}`) : 'Folder not found'}
                      </span>
                    </button>
                  </Tooltip>
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
