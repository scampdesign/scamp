import { describeChange } from '@shared/embedded';

import { Tooltip } from '../src/components/controls/Tooltip';
import { AgentChat } from './AgentChat';
import { AgentChoice } from './AgentChoice';
import { DesignCheck } from './DesignCheck';
import { useEmbeddedStore } from './embeddedStore';
import { removeQueued } from './session';
import styles from './Tabs.module.css';

type Props = {
  /** Always mounted, so the agent's terminal survives a switch of tabs. */
  active: boolean;
};

/** Everything about the agent: who it is and how it connects, what it's working on, and design checks. */
export const AgentTab = ({ active }: Props): JSX.Element => {
  const agent = useEmbeddedStore((s) => s.agent);
  const startLog = useEmbeddedStore((s) => s.startLog);
  const running = agent.phase === 'thinking' || agent.phase === 'writing';

  return (
    <div className={styles.tab} data-active={active}>
      <section className={styles.section}>
        <h3 className={styles.title}>Agent</h3>
        <AgentChoice />
      </section>

      <section className={styles.section}>
        <h3 className={styles.title}>Queue</h3>
        <div className={styles.row}>
          <button
            type="button"
            className={styles.button}
            aria-pressed={agent.paused}
            onClick={() => void window.scampEmbedded.setPaused(!agent.paused)}
            data-testid="embedded-pause"
          >
            {agent.paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={agent.queued.length === 0 || running}
            onClick={() => void window.scampEmbedded.runNow()}
            data-testid="embedded-run-now"
          >
            Run now
          </button>
          {running && (
            <button type="button" className={styles.button} onClick={() => void window.scampEmbedded.cancel()}>
              Stop
            </button>
          )}
        </div>
        {agent.message !== undefined && <p className={styles.note}>{agent.message}</p>}
        {agent.queued.length === 0 ? (
          <p className={styles.empty}>{agent.paused ? 'Paused. Edits wait here until you resume or run them.' : 'Edits you make go to the agent here.'}</p>
        ) : (
          <ul className={styles.list} data-testid="embedded-queue">
            {agent.queued.map((item) => (
              <li key={item.id} className={styles.item}>
                <Tooltip label={describeChange(item).detail || describeChange(item).text}>
                  <span className={styles.itemText}>{describeChange(item).text}</span>
                </Tooltip>
                <button type="button" className={styles.remove} onClick={() => void removeQueued(item.id)} aria-label="Remove from queue">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.title}>Conversation</h3>
        <AgentChat />
      </section>

      {startLog.length > 0 && (
        <details className={styles.log} data-testid="embedded-server-output">
          <summary>Dev server output</summary>
          <pre className={styles.serverOutput}>{startLog}</pre>
        </details>
      )}

      <section className={styles.section}>
        <h3 className={styles.title}>Design check</h3>
        <DesignCheck />
      </section>
    </div>
  );
};
