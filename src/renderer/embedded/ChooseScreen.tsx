import { useState } from 'react';

import { useEmbeddedStore } from './embeddedStore';
import styles from './ChooseScreen.module.css';

/** The first screen: pick the project folder. */
export const ChooseScreen = (): JSX.Element => {
  const set = useEmbeddedStore((s) => s.set);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleChoose = async (): Promise<void> => {
    setError(null);
    const chosen = await window.scampEmbedded.chooseFolder();
    if (chosen.kind === 'cancelled') return;
    setBusy(true);
    const report = await window.scampEmbedded.open(chosen.folder);
    setBusy(false);
    if ('error' in report) {
      setError(report.error);
      return;
    }
    set({ folder: chosen.folder, preflight: report, screen: 'setup' });
  };

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <h1 className={styles.title}>Edit a React project</h1>
        <p className={styles.lede}>
          Choose a Vite + React project on your computer. Scamp runs it, and you restyle the real app with the Scamp
          panel. The Scamp Agent writes each change into your source, on its own git branch.
        </p>
        <button type="button" className={styles.primary} onClick={handleChoose} disabled={busy} data-testid="embedded-choose">
          {busy ? 'Checking the project…' : 'Choose project folder'}
        </button>
        {error !== null && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  );
};
