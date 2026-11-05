import { useEffect } from 'react';

import { ChooseScreen } from './ChooseScreen';
import { EditorScreen } from './EditorScreen';
import { useEmbeddedStore } from './embeddedStore';
import { SetupScreen } from './SetupScreen';
import { startSession } from './session';
import styles from './EmbeddedApp.module.css';

/** Embedded Scamp: choose a React project, set it up, then edit it in place. */
export const EmbeddedApp = (): JSX.Element => {
  const screen = useEmbeddedStore((s) => s.screen);
  useEffect(() => {
    startSession();
  }, []);
  return (
    <div className={styles.app}>
      {screen === 'choose' && <ChooseScreen />}
      {screen === 'setup' && <SetupScreen />}
      {screen === 'editor' && <EditorScreen />}
    </div>
  );
};
