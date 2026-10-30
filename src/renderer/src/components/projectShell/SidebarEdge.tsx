import { usePanelSizesStore } from '@store/panelSizesSlice';
import {
  SIDEBAR_COLLAPSE_BELOW,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clampSidebarWidth,
} from '@lib/panelSizes';

import { ResizeHandle } from '../controls/ResizeHandle';
import styles from './PanelEdges.module.css';

type Props = {
  /** The width the sidebar draws at. */
  width: number;
  windowWidth: number;
};

/** The left panel's right edge: drag to resize, past the minimum to close. */
export const SidebarEdge = ({ width, windowWidth }: Props): JSX.Element => {
  const setWidth = usePanelSizesStore((s) => s.setSidebarWidth);
  const setCollapsed = usePanelSizesStore((s) => s.setSidebarCollapsed);
  const save = usePanelSizesStore((s) => s.save);
  return (
    <ResizeHandle
      orientation="vertical"
      direction={1}
      value={width}
      min={SIDEBAR_MIN}
      max={clampSidebarWidth(SIDEBAR_MAX, windowWidth)}
      label="Resize the left panel"
      className={styles.sidebarEdge}
      onChange={(size) => setWidth(clampSidebarWidth(size, windowWidth))}
      onCommit={(size, startSize) => {
        if (size < SIDEBAR_COLLAPSE_BELOW) {
          // Opening it again returns to the width it had before this drag.
          setWidth(startSize);
          setCollapsed(true);
          return;
        }
        setWidth(clampSidebarWidth(size, windowWidth));
        save();
      }}
      onReset={() => {
        setWidth(SIDEBAR_DEFAULT);
        save();
      }}
    />
  );
};
