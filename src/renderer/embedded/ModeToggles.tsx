import { IconPointer, IconSnowflake } from '@tabler/icons-react';

import { Tooltip } from '../src/components/controls/Tooltip';
import { useEmbeddedStore } from './embeddedStore';
import { setModes } from './session';
import styles from './ModeToggles.module.css';

/** Freeze (with its F8 shortcut) and Editing, at the end of the artboard header, as icon toggles. */
export const ModeToggles = (): JSX.Element => {
  const edit = useEmbeddedStore((s) => s.edit);
  const frozen = useEmbeddedStore((s) => s.frozen);
  return (
    <div className={styles.toggles}>
      <Tooltip label="Freeze — Keep menus, popovers, and tooltips open while you style them. Press F8 with the pointer on the page.">
      <button
        type="button"
        className={styles.toggle}
        aria-pressed={frozen}
        onClick={() => setModes({ frozen: !frozen })}
        aria-label="Freeze (F8)"
        data-testid="embedded-freeze-toggle"
      >
        <IconSnowflake className={styles.icon} aria-hidden="true" />
        {/* The shortcut, shown so it's learned: F8 is the way to freeze something that closes on leave. */}
        <kbd className={styles.key}>F8</kbd>
      </button>
      </Tooltip>
      <Tooltip label="Editing — Click elements to select and style them. Turn off to use the app.">
      <button
        type="button"
        className={styles.toggle}
        aria-pressed={edit}
        onClick={() => setModes({ edit: !edit })}
        aria-label="Editing"
        data-testid="embedded-edit-toggle"
      >
        <IconPointer className={styles.icon} aria-hidden="true" />
      </button>
      </Tooltip>
    </div>
  );
};
