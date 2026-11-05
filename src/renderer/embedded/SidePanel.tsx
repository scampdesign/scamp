import { useState } from 'react';

import { ChangesTab } from './ChangesTab';
import { ChecksTab } from './ChecksTab';
import { useEmbeddedStore } from './embeddedStore';
import { StyleTab } from './StyleTab';
import styles from './SidePanel.module.css';

type Tab = 'style' | 'changes' | 'checks';

/** Style the selection, review and commit what the agent wrote, or check the design. */
export const SidePanel = (): JSX.Element => {
  const [tab, setTab] = useState<Tab>('style');
  const waiting = useEmbeddedStore((s) => s.agent.queued.length + (s.git?.agentFiles.length ?? 0));
  return (
    <aside className={styles.panel}>
      <div className={styles.tabs} role="tablist">
        {(['style', 'changes', 'checks'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={styles.tab}
            onClick={() => setTab(t)}
            data-testid={`embedded-tab-${t}`}
          >
            {t === 'style' ? 'Style' : t === 'changes' ? 'Changes' : 'Checks'}
            {t === 'changes' && waiting > 0 && <span className={styles.badge}>{waiting}</span>}
          </button>
        ))}
      </div>
      <div className={styles.content}>
        {tab === 'style' && <StyleTab />}
        {tab === 'changes' && <ChangesTab />}
        {tab === 'checks' && <ChecksTab />}
      </div>
    </aside>
  );
};
