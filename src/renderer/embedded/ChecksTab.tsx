import { AgentMarkdown } from '../src/components/agent/AgentMarkdown';
import { useEmbeddedStore } from './embeddedStore';
import styles from './ChecksTab.module.css';

/** A read of the whole project: tokens, accessibility, scales and duplicated styles. */
export const ChecksTab = (): JSX.Element => {
  const report = useEmbeddedStore((s) => s.report);
  const checking = useEmbeddedStore((s) => s.checking);
  const set = useEmbeddedStore((s) => s.set);

  const handleRun = async (): Promise<void> => {
    set({ checking: true, report: null });
    await window.scampEmbedded.designCheck();
  };

  return (
    <div className={styles.tab}>
      <p className={styles.lede}>
        The agent reads the whole project and reports one-off values, accessibility problems, values off the
        project&rsquo;s scale, and duplicated styles. It doesn&rsquo;t change any files.
      </p>
      <button type="button" className={styles.run} onClick={() => void handleRun()} disabled={checking} data-testid="embedded-design-check">
        {checking ? 'Checking…' : 'Run design check'}
      </button>
      {report !== null && (
        <div className={styles.report} data-testid="embedded-report">
          <AgentMarkdown text={report} />
        </div>
      )}
    </div>
  );
};
