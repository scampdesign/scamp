import { useAgentStore } from '@store/agentSlice';

import styles from './AgentPanel.module.css';

type Props = {
  viewName: string;
  appName: string;
};

/**
 * "Tidy up with AI", for a view imported from a React app: the agent reads
 * the app's source for what one render couldn't show — when things appear,
 * and what the app calls its lists — and shows a plan first.
 * see docs/plans/react-import-plan.md, Phase 6
 */
export const ReactTidyCard = ({ viewName, appName }: Props): JSX.Element => {
  const startReactTidy = useAgentStore((s) => s.startReactTidy);
  return (
    <div className={styles.cleanupCard} data-testid="agent-react-tidy-card">
      <p className={styles.cleanupTitle}>Tidy up {viewName}</p>
      <p className={styles.emptyText}>
        The agent reads {appName}’s source for what the import couldn’t see: which parts of this page show only
        sometimes, and what the app calls its lists. It doesn’t change how the page looks, and it shows you a plan
        first.
      </p>
      <button type="button" className={styles.cleanupChoice} onClick={() => void startReactTidy(viewName)}>
        <span className={styles.cleanupChoiceLabel}>Tidy up with AI</span>
        <span className={styles.cleanupChoiceHint}>Show conditions and list names, from the source.</span>
      </button>
    </div>
  );
};
