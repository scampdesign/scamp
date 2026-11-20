import type { EmbeddedWorker } from '@shared/types';

import { useEmbeddedStore } from './embeddedStore';
import styles from './AgentChoice.module.css';

/**
 * Who writes the changes: the Scamp Agent (an API key), or the user's own
 * agent (Claude Code and others) over Scamp's MCP server, signed in as it
 * already is. Connecting it, and its terminal, are in `AgentConnect`; here
 * is how it's doing, and the way back to that window.
 * see docs/plans/embedded-agent-connection-plan.md
 */
export const AgentChoice = (): JSX.Element => {
  const status = useEmbeddedStore((s) => s.ownAgent);
  const set = useEmbeddedStore((s) => s.set);
  const worker = status?.worker ?? 'scamp';

  const handleChoose = async (next: EmbeddedWorker): Promise<void> => {
    const now = await window.scampEmbedded.setWorker(next);
    // Choosing My agent shows how to connect it, unless it already is.
    set({ ownAgent: now, agentConnectOpen: next === 'own' && now?.seen !== true });
  };

  const state = status === null ? 'waiting' : status.working ? 'working' : status.seen ? 'connected' : 'waiting';
  return (
    <div className={styles.choice}>
      <div className={styles.toggle} role="group" aria-label="Who writes your changes">
        <button type="button" aria-pressed={worker === 'scamp'} onClick={() => void handleChoose('scamp')} data-testid="embedded-worker-scamp">
          Scamp Agent
        </button>
        <button type="button" aria-pressed={worker === 'own'} onClick={() => void handleChoose('own')} data-testid="embedded-worker-own">
          My agent
        </button>
      </div>
      {worker === 'own' && (
        <div className={styles.own} data-testid="embedded-own-agent">
          <p className={styles.state} data-state={state}>
            {state === 'working' ? 'Writing changes' : state === 'connected' ? 'Connected' : 'Waiting to connect'}
          </p>
          <button type="button" className={styles.open} onClick={() => set({ agentConnectOpen: true })} data-testid="embedded-agent-connect-open">
            {state === 'waiting' ? 'Connect' : 'Open terminal'}
          </button>
        </div>
      )}
    </div>
  );
};
