import { AppToolbar } from './AppToolbar';
import { AppView } from './AppView';
import { SidePanel } from './SidePanel';
import styles from './EditorScreen.module.css';

/** The running app beside Scamp's panel, the agent and git. */
export const EditorScreen = (): JSX.Element => (
  <div className={styles.screen}>
    <AppToolbar />
    <div className={styles.body}>
      <AppView />
      <SidePanel />
    </div>
  </div>
);
