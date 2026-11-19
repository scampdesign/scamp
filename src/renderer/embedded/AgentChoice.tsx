import { useEffect, useState } from 'react';

import { OWN_AGENT_LINE } from '@shared/embedded';
import type { EmbeddedOwnAgentStatus, EmbeddedWorker } from '@shared/types';

import { AgentTerminal } from './AgentTerminal';
import styles from './AgentChoice.module.css';

const POLL_MS = 2000;

/**
 * Who writes the changes: the Scamp Agent (an API key), or the user's own
 * agent (Claude Code and others) over Scamp's MCP server, signed in as it
 * already is. see docs/plans/embedded-agent-connection-plan.md
 */
export const AgentChoice = (): JSX.Element => {
  const [status, setStatus] = useState<EmbeddedOwnAgentStatus | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const worker = status?.worker ?? 'scamp';

  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      void window.scampEmbedded.ownAgentStatus().then((next) => {
        if (!cancelled) setStatus(next);
      });
    };
    load();
    // Whether the user's agent has connected changes outside this window: ask again.
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const handleChoose = async (next: EmbeddedWorker): Promise<void> => {
    setStatus(await window.scampEmbedded.setWorker(next));
  };

  const handleCopy = async (text: string): Promise<void> => {
    await navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className={styles.choice}>
      <div className={styles.toggle} role="group" aria-label="Who writes your changes">
        <button type="button" aria-pressed={worker === 'scamp'} onClick={() => void handleChoose('scamp')} data-testid="embedded-worker-scamp">
          Scamp Agent
        </button>
        <button type="button" aria-pressed={worker === 'own'} onClick={() => void handleChoose('own')} data-testid="embedded-worker-own">
          My agent
        </button>
      </div>
      {worker === 'own' && status !== null && (
        <div className={styles.own} data-testid="embedded-own-agent">
          <p className={styles.state} data-state={status.working ? 'working' : status.seen ? 'connected' : 'waiting'}>
            {status.working
              ? 'Your agent is writing changes.'
              : status.seen
                ? 'Your agent is connected.'
                : 'Waiting for your agent to connect.'}
          </p>
          {!status.seen && (
            <ol className={styles.steps}>
              <li>
                In the terminal below, click <strong>Start Claude Code</strong>, or start another agent
                {status.written.length > 0 ? ` (Scamp set up ${status.written.join(', ')})` : ''}. If it asks to use the{' '}
                <code>scamp</code> server, allow it.
              </li>
              <li>
                Click <strong>Paste the prompt</strong> and press Enter, or tell it:
                <span className={styles.copyRow}>
                  <code className={styles.line}>{OWN_AGENT_LINE}</code>
                  <button type="button" className={styles.copy} onClick={() => void handleCopy(OWN_AGENT_LINE)}>
                    {copied === OWN_AGENT_LINE ? 'Copied' : 'Copy'}
                  </button>
                </span>
              </li>
            </ol>
          )}
          <AgentTerminal />
          {status.skipped.length > 0 && status.command !== null && (
            <div className={styles.manual}>
              <p>
                Scamp didn’t change {status.skipped.map((s) => s.path).join(', ')}: {status.skipped[0]?.reason}. To connect Claude Code
                yourself, run this in the project’s folder:
              </p>
              <span className={styles.copyRow}>
                <code className={styles.line}>{status.command}</code>
                <button type="button" className={styles.copy} onClick={() => void handleCopy(status.command ?? '')}>
                  {copied === status.command ? 'Copied' : 'Copy'}
                </button>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
