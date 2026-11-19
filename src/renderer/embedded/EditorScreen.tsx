import { AppToolbar } from './AppToolbar';
import { AppView } from './AppView';
import { ArtboardHeader } from './ArtboardHeader';
import { useEmbeddedStore } from './embeddedStore';
import { LayersPanel } from './LayersPanel';
import { SidePanel } from './SidePanel';
import styles from './EditorScreen.module.css';

/**
 * The running app beside Scamp's panel, the agent and git, laid out as the
 * scamp-ui Layout design: a title bar, then layers, the artboard, and the panel.
 */
export const EditorScreen = (): JSX.Element => {
  const layersOpen = useEmbeddedStore((s) => s.layersOpen);
  return (
    <div className={styles.screen}>
      <AppToolbar />
      <div className={styles.body}>
        {layersOpen && <LayersPanel />}
        <div className={styles.artboard}>
          <ArtboardHeader />
          <AppView />
        </div>
        <SidePanel />
      </div>
    </div>
  );
};
