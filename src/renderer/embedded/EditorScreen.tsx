import { AppToolbar } from './AppToolbar';
import { AppView } from './AppView';
import { useEmbeddedStore } from './embeddedStore';
import { LayersPanel } from './LayersPanel';
import { SidePanel } from './SidePanel';
import styles from './EditorScreen.module.css';

/** The running app beside Scamp's panel, the agent and git. */
export const EditorScreen = (): JSX.Element => {
  const layersOpen = useEmbeddedStore((s) => s.layersOpen);
  return (
    <div className={styles.screen}>
      <AppToolbar />
      <div className={styles.body}>
        {layersOpen && <LayersPanel />}
        <AppView />
        <SidePanel />
      </div>
    </div>
  );
};
