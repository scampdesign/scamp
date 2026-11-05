import type { EmbeddedAgentPhase } from '@shared/types';

import { useEmbeddedStore } from './embeddedStore';
import styles from './AgentStatus.module.css';

const LABEL: Record<EmbeddedAgentPhase, string> = {
  idle: 'Agent ready',
  paused: 'Paused',
  thinking: 'Thinking…',
  writing: 'Writing code…',
  done: 'Done',
  error: 'Stopped',
};

/** What the agent is doing, and how many edits wait for it. */
export const AgentStatus = (): JSX.Element => {
  const agent = useEmbeddedStore((s) => s.agent);
  const phase = agent.paused && agent.phase === 'idle' ? 'paused' : agent.phase;
  return (
    <span className={styles.pill} data-phase={phase} data-testid="embedded-agent-status" title={agent.message ?? agent.lastText}>
      <span className={styles.dot} aria-hidden="true" />
      {LABEL[phase]}
      {agent.queued.length > 0 && <span className={styles.count}>{agent.queued.length} queued</span>}
    </span>
  );
};
