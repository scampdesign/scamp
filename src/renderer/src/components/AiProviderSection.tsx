import { useState } from 'react';

import type { AgentKeyStatus } from '@shared/types';
import { useIsSignedIn } from '@store/authSlice';

import { useAgentKey } from './agent/useAgentKey';
import settingsStyles from './SettingsPage.module.css';
import styles from './AiProviderSection.module.css';

/**
 * Connect the user's own Claude API key for the Scamp Agent.
 *
 * Signed-in users only, and invisible otherwise — no teaser during the
 * beta. The key leaves this component on submit and is never read back:
 * main only ever answers with a status.
 * see docs/plans/builtin-agent-plan.md
 */

const STATUS_TEXT: Record<AgentKeyStatus, string> = {
  connected: 'Connected',
  'session-only': 'Connected for this session',
  invalid: 'Anthropic no longer accepts the saved key',
  'not-connected': 'Not connected',
};

export const AiProviderSection = (): JSX.Element | null => {
  const signedIn = useIsSignedIn();
  const { status, checking, error, connect, disconnect } = useAgentKey(signedIn);
  const [draft, setDraft] = useState('');

  if (!signedIn || status === null) return null;

  const handleConnect = async (): Promise<void> => {
    if (await connect(draft)) setDraft('');
  };

  const handleDisconnect = async (): Promise<void> => {
    await disconnect();
  };

  const connected = status === 'connected' || status === 'session-only';

  return (
    <div className={settingsStyles.section}>
      <h2 className={settingsStyles.sectionTitle}>AI provider</h2>
      <div className={settingsStyles.row}>
        <div className={settingsStyles.rowLabel}>
          <div>Claude API key</div>
          <div className={settingsStyles.rowHint}>
            The Scamp Agent runs on your own Anthropic account. Create a key
            in the Claude Console at console.anthropic.com, then paste it here.
            Scamp stores it encrypted on this computer.
          </div>
        </div>
        <div className={`${settingsStyles.rowControl} ${styles.control}`}>
          <span
            className={`${styles.status} ${connected ? styles.statusOk : ''} ${
              status === 'invalid' ? styles.statusError : ''
            }`}
            data-testid="ai-provider-status"
          >
            {STATUS_TEXT[status]}
          </span>
          {connected ? (
            <button
              type="button"
              className={settingsStyles.smallButton}
              onClick={() => void handleDisconnect()}
            >
              Disconnect
            </button>
          ) : (
            <form
              className={styles.form}
              onSubmit={(e) => {
                e.preventDefault();
                void handleConnect();
              }}
            >
              <input
                type="password"
                className={styles.input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="sk-ant-…"
                autoComplete="off"
                spellCheck={false}
                aria-label="Claude API key"
                disabled={checking}
              />
              <button
                type="submit"
                className={settingsStyles.smallButton}
                disabled={checking || draft.trim().length === 0}
              >
                {checking ? 'Checking…' : 'Connect'}
              </button>
            </form>
          )}
        </div>
      </div>
      {status === 'session-only' && (
        <p className={styles.note}>
          Your system can’t encrypt the key, so Scamp keeps it only until you
          quit. Paste it again the next time you open Scamp.
        </p>
      )}
      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
