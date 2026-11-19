import { IconDeviceDesktop, IconDeviceMobile, IconDeviceTablet } from '@tabler/icons-react';

import { Tooltip } from '../src/components/controls/Tooltip';
import { useEmbeddedStore } from './embeddedStore';
import { IconButton } from './IconButton';
import { setViewport } from './session';
import styles from './ViewportControl.module.css';

const PRESETS = [
  { label: 'Desktop', width: null, icon: IconDeviceDesktop },
  { label: 'Tablet', width: 768, icon: IconDeviceTablet },
  { label: 'Mobile', width: 390, icon: IconDeviceMobile },
] as const;

/**
 * The app's width: the window's (desktop), a tablet, or a phone. An edit
 * made below desktop applies at that width and narrower.
 * see docs/plans/embedded-canvas-gaps.md (P4)
 */
export const ViewportControl = (): JSX.Element => {
  const viewport = useEmbeddedStore((s) => s.viewport);
  return (
    <div className={styles.control} role="group" aria-label="App width">
      {PRESETS.map((p) => (
        <IconButton
          key={p.label}
          icon={p.icon}
          variant="bare"
          label={p.label}
          tooltip={p.width === null ? `${p.label} — The app at the window's full width.` : `${p.label} — The app ${p.width}px wide. Edits made here apply at this width and narrower.`}
          pressed={viewport === p.width}
          onClick={() => setViewport(p.width)}
          testId={`embedded-viewport-${p.label.toLowerCase()}`}
        />
      ))}
    </div>
  );
};
