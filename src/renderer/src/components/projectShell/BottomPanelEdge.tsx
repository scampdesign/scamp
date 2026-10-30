import { usePanelSizesStore } from '@store/panelSizesSlice';
import { BOTTOM_DEFAULT, BOTTOM_MIN, clampBottomHeight } from '@lib/panelSizes';

import { ResizeHandle } from '../controls/ResizeHandle';
import styles from './PanelEdges.module.css';

type Props = {
  /** The height the code or terminal panel draws at. */
  height: number;
  windowHeight: number;
};

/** The top edge of the code and terminal panel; one height serves both. */
export const BottomPanelEdge = ({ height, windowHeight }: Props): JSX.Element => {
  const setHeight = usePanelSizesStore((s) => s.setBottomPanelHeight);
  const save = usePanelSizesStore((s) => s.save);
  return (
    <ResizeHandle
      orientation="horizontal"
      direction={-1}
      value={height}
      min={BOTTOM_MIN}
      max={clampBottomHeight(Number.POSITIVE_INFINITY, windowHeight)}
      label="Resize the bottom panel"
      className={styles.bottomEdge}
      onChange={(size) => setHeight(clampBottomHeight(size, windowHeight))}
      onCommit={(size) => {
        setHeight(clampBottomHeight(size, windowHeight));
        save();
      }}
      onReset={() => {
        setHeight(BOTTOM_DEFAULT);
        save();
      }}
    />
  );
};
