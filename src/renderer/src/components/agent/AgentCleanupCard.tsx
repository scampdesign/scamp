import type { AgentTokenMode } from '@shared/types';
import { rememberedTokenMode, useAgentStore } from '@store/agentSlice';

import styles from './AgentPanel.module.css';

type Props = {
  projectPath: string;
  viewName: string;
};

/**
 * "Clean up this import", for the view imported most recently. The token
 * question comes first, because it decides what the cleanup may touch:
 * theme.css, or nothing outside the page.
 * see docs/plans/builtin-agent-plan.md
 */
export const AgentCleanupCard = ({ projectPath, viewName }: Props): JSX.Element => {
  const startCleanup = useAgentStore((s) => s.startCleanup);
  const remembered = rememberedTokenMode(projectPath);

  const choice = (mode: AgentTokenMode, label: string, hint: string): JSX.Element => (
    <button
      type="button"
      className={`${styles.cleanupChoice} ${remembered === mode ? styles.cleanupChoiceLast : ''}`}
      onClick={() => void startCleanup(mode)}
    >
      <span className={styles.cleanupChoiceLabel}>{label}</span>
      <span className={styles.cleanupChoiceHint}>{hint}</span>
    </button>
  );

  return (
    <div className={styles.cleanupCard} data-testid="agent-cleanup-card">
      <p className={styles.cleanupTitle}>Clean up {viewName}</p>
      <p className={styles.emptyText}>
        The agent makes the page you just imported easier to edit, without changing how it looks. It shows
        you a plan before changing anything. What should it do with repeated colors and sizes?
      </p>
      {choice('create-tokens', 'Create theme tokens', 'Name repeated values and use them through theme.css.')}
      {choice('keep-literal', 'Keep hex values', 'Leave values as the page wrote them. theme.css is not touched.')}
    </div>
  );
};
