import type { EmbeddedAgentPhase } from '@shared/types';

import { Tooltip } from '../src/components/controls/Tooltip';
import { useEmbeddedStore } from './embeddedStore';
import styles from './AgentStatus.module.css';

const LABEL: Record<EmbeddedAgentPhase, string> = {
  idle: 'Agent Ready',
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
  const pill = (
    <span className={styles.status} data-phase={phase} data-testid="embedded-agent-status">
      <span className={styles.dot} aria-hidden="true" />
      {LABEL[phase]}
      {agent.queued.length > 0 && <span className={styles.count}>{agent.queued.length} queued</span>}
    </span>
  );
  // What the agent last said, or why it stopped; nothing to show before its first run.
  const detail = agent.message ?? agent.lastText;
  return detail.length > 0 ? <Tooltip label={`Agent — ${detail}`}>{pill}</Tooltip> : pill;
};
