import { AgentTab } from './AgentTab';
import { useEmbeddedStore, type PanelTab } from './embeddedStore';
import { HistoryTab } from './HistoryTab';
import { StyleTab } from './StyleTab';
import styles from './SidePanel.module.css';

type Tab = PanelTab;

const LABEL: Record<Tab, string> = { style: 'Style', history: 'History', agent: 'Agent' };

/** Style the selection; review, undo, and commit what's been done; or work with the agent. */
export const SidePanel = (): JSX.Element => {
  const tab = useEmbeddedStore((s) => s.panelTab);
  const setTab = (next: Tab): void => useEmbeddedStore.getState().set({ panelTab: next });
  // History counts what's waiting to be reviewed; Agent, what's waiting for the agent.
  const toReview = useEmbeddedStore((s) => s.git?.agentFiles.length ?? 0);
  const queued = useEmbeddedStore((s) => s.agent.queued.length);
  const badge: Record<Tab, number> = { style: 0, history: toReview, agent: queued };
  return (
    <aside className={styles.panel}>
      <div className={styles.tabs} role="tablist">
        {(['style', 'history', 'agent'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={styles.tab}
            onClick={() => setTab(t)}
            data-testid={`embedded-tab-${t}`}
          >
            {LABEL[t]}
            {badge[t] > 0 && <span className={styles.badge}>{badge[t]}</span>}
          </button>
        ))}
      </div>
      <div className={styles.content}>
        {tab === 'style' && <StyleTab />}
        {tab === 'history' && <HistoryTab />}
        {/* Always mounted: it holds the terminal the user's own agent runs in. */}
        <div hidden={tab !== 'agent'} className={styles.keep}>
          <AgentTab active={tab === 'agent'} />
        </div>
      </div>
    </aside>
  );
};
