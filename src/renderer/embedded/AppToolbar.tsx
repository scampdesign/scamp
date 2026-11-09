import { useEffect } from 'react';
import { IconGitBranch } from '@tabler/icons-react';

import { Tooltip } from '../src/components/controls/Tooltip';
import { AgentStatus } from './AgentStatus';
import { useEmbeddedStore } from './embeddedStore';
import { releaseHeld, setModes } from './session';
import styles from './AppToolbar.module.css';

// macOS draws its window buttons over the bar's left end.
const MAC = navigator.userAgent.includes('Macintosh');

/** The title bar, as the scamp-ui Layout design: the project and its branch, then the agent. */
export const AppToolbar = (): JSX.Element => {
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
          <Tooltip label="Branch — Your work happens on this branch. Click to switch branches, push, or pull.">
            <button
              type="button"
              className={styles.branch}
              onClick={() => useEmbeddedStore.getState().set({ panelTab: 'history' })}
              data-testid="embedded-branch"
            >
              <IconGitBranch className={styles.branchIcon} aria-hidden="true" />
              {branch}
            </button>
          </Tooltip>
        )}
      </div>
      <div className={styles.group}>
        {toast !== null && (
          <span className={styles.toast} role="status" data-testid="embedded-toast">
            {toast}
          </span>
        )}
        {held.length > 0 && (
          <Tooltip label={`Holding — ${held.map((h) => `${h.label} :${h.states.join(' :')}`).join('\n')}`}>
          <span className={styles.held} data-testid="embedded-held">
            Holding :{held[0]?.states[0]} on {held[0]?.label}
            {held.length > 1 ? ` +${held.length - 1}` : ''}
            <button type="button" className={styles.release} onClick={releaseHeld} data-testid="embedded-release">
              Release
            </button>
          </span>
          </Tooltip>
        )}
        <AgentStatus />
      </div>
    </header>
  );
};
