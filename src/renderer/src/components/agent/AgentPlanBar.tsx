import { useAgentStore } from '@store/agentSlice';

import styles from './AgentPanel.module.css';

/**
 * Under a cleanup's plan: apply it as written, or reply to change it.
 * The agent waits for one or the other before it edits anything.
 */
export const AgentPlanBar = (): JSX.Element => {
  const approvePlan = useAgentStore((s) => s.approvePlan);
  return (
    <div className={styles.planBar} data-testid="agent-plan-bar">
      <button type="button" className={styles.primaryButton} onClick={() => void approvePlan()}>
        Apply this plan
      </button>
      <span className={styles.planHint}>Or reply to change it.</span>
    </div>
  );
};
