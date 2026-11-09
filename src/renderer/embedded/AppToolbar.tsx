import { useEffect } from 'react';

import { AgentStatus } from './AgentStatus';
import { useEmbeddedStore } from './embeddedStore';
import { releaseHeld, setModes } from './session';
import styles from './AppToolbar.module.css';

// macOS draws its window buttons over the bar's left end.
const MAC = navigator.userAgent.includes('Macintosh');

/** The title bar, as the scamp-ui Layout design: the project, then Freeze, Editing, and the agent. */
export const AppToolbar = (): JSX.Element => {
  const edit = useEmbeddedStore((s) => s.edit);
  const frozen = useEmbeddedStore((s) => s.frozen);
  const held = useEmbeddedStore((s) => s.held);
  const toast = useEmbeddedStore((s) => s.toast);
  const name = useEmbeddedStore((s) => s.preflight?.name ?? s.folder?.split(/[\\/]/).pop() ?? 'Project');
  // F8 freezes from here too; inside the page, the inspector answers it.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key !== 'F8' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      e.preventDefault();
      setModes({ frozen: !useEmbeddedStore.getState().frozen });
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <header className={styles.bar} data-mac={MAC}>
      <p className={styles.name}>{name}</p>
      <div className={styles.group}>
        {toast !== null && (
          <span className={styles.toast} role="status" data-testid="embedded-toast">
            {toast}
          </span>
        )}
        {held.length > 0 && (
          <span className={styles.held} data-testid="embedded-held" title={held.map((h) => `${h.label} :${h.states.join(' :')}`).join('\n')}>
            Holding :{held[0]?.states[0]} on {held[0]?.label}
            {held.length > 1 ? ` +${held.length - 1}` : ''}
            <button type="button" className={styles.release} onClick={releaseHeld} data-testid="embedded-release">
              Release
            </button>
          </span>
        )}
        <button
          type="button"
          className={styles.pill}
          aria-pressed={frozen}
          onClick={() => setModes({ frozen: !frozen })}
          title="Keep menus, popovers, and tooltips open while you style them (F8, with the pointer on the page)"
          data-testid="embedded-freeze-toggle"
        >
          Freeze State
        </button>
        <button
          type="button"
          className={styles.pill}
          aria-pressed={edit}
          onClick={() => setModes({ edit: !edit })}
          title="Click elements to select and style them. Turn off to use the app."
          data-testid="embedded-edit-toggle"
        >
          Editing
        </button>
        <AgentStatus />
      </div>
    </header>
  );
};
