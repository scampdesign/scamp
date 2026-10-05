import { useState } from 'react';

import type { AgentKeyControls } from './useAgentKey';
import styles from './AgentPanel.module.css';

type Props = {
  keyControls: AgentKeyControls;
};

/**
 * The panel's state before a key is connected — or after Anthropic stops
 * accepting it. Connecting here does what Settings → AI provider does.
 */
export const AgentConnect = ({ keyControls }: Props): JSX.Element => {
  const [draft, setDraft] = useState('');
  const invalid = keyControls.status === 'invalid';

  const handleSubmit = async (): Promise<void> => {
    if (await keyControls.connect(draft)) setDraft('');
  };

  return (
    <div className={styles.connect} data-testid="agent-connect">
      <p className={styles.connectTitle}>
        {invalid ? 'Anthropic no longer accepts your key' : 'Connect Claude to use the agent'}
      </p>
      <p className={styles.connectHint}>
        The Scamp Agent runs on your own Anthropic account. Create a key in the
        Claude Console at console.anthropic.com, then paste it here. Scamp
        stores it encrypted on this computer.
      </p>
      <form
        className={styles.connectForm}
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <input
          type="password"
          className={styles.connectInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="sk-ant-…"
          autoComplete="off"
          spellCheck={false}
          aria-label="Claude API key"
          disabled={keyControls.checking}
        />
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={keyControls.checking || draft.trim().length === 0}
        >
          {keyControls.checking ? 'Checking…' : 'Connect'}
        </button>
      </form>
      {keyControls.error !== null && (
        <p className={styles.replyError} role="alert">
          {keyControls.error}
        </p>
      )}
    </div>
  );
};
