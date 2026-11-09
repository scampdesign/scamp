import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconReload } from '@tabler/icons-react';

import { useEmbeddedStore } from './embeddedStore';
import { IconButton } from './IconButton';
import { ModeToggles } from './ModeToggles';
import { PathField } from './PathField';
import { navigatePage, refreshTree } from './session';
import { ViewportControl } from './ViewportControl';
import styles from './ArtboardHeader.module.css';

/** Above the app, as the design's artboard header: the layers toggle, the page's path, reload, its width, then Freeze and Editing. */
export const ArtboardHeader = (): JSX.Element => {
  const layersOpen = useEmbeddedStore((s) => s.layersOpen);
  return (
    <div className={styles.header}>
      <IconButton
        icon={layersOpen ? IconLayoutSidebarLeftCollapse : IconLayoutSidebarLeftExpand}
        variant="bare"
        label={layersOpen ? 'Hide layers' : 'Show layers'}
        onClick={() => {
          useEmbeddedStore.getState().set({ layersOpen: !layersOpen });
          if (!layersOpen) void refreshTree();
        }}
        testId="embedded-layers-toggle"
      />
      <PathField />
      <IconButton icon={IconReload} variant="bare" label="Reload" onClick={() => navigatePage('reload')} />
      <ViewportControl />
      <ModeToggles />
    </div>
  );
};
