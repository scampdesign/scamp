import { useEffect } from 'react';
import { IconGitBranch, IconPointer, IconSnowflake } from '@tabler/icons-react';

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
  const branch = useEmbeddedStore((s) => s.branch);
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
      <div className={styles.project}>
        <p className={styles.name}>{name}</p>
        {branch !== null && (
          // The branch, muted; a click opens History, where branches are switched, pushed, and pulled.
          <button
            type="button"
            className={styles.branch}
            onClick={() => useEmbeddedStore.getState().set({ panelTab: 'history' })}
            title="Your work happens on this branch. Click to switch branches, push, or pull."
            data-testid="embedded-branch"
          >
            <IconGitBranch className={styles.branchIcon} aria-hidden="true" />
            {branch}
          </button>
        )}
      </div>
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
          <IconSnowflake className={styles.pillIcon} aria-hidden="true" />
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
          <IconPointer className={styles.pillIcon} aria-hidden="true" />
          Editing
        </button>
        <AgentStatus />
      </div>
    </header>
  );
};
