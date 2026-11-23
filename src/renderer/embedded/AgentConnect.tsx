import { useCallback, useEffect, useRef, useState } from 'react';
import { IconMinus } from '@tabler/icons-react';

import { OWN_AGENT_LINE } from '@shared/embedded';

import { TerminalView } from '../src/components/TerminalView';
import { IconButton } from './IconButton';
import { useEmbeddedStore } from './embeddedStore';
import styles from './AgentConnect.module.css';

const POLL_MS = 2000;

/**
 * Connecting the user's own agent (Claude Code and others): the steps and a
 * full-size terminal in the project's folder, in a window over the editor.
 * It opens when My agent is chosen, minimizes into the Agent tab once the
 * agent connects, and stays mounted while minimized, so the agent's
 * terminal session lives on. It also keeps the store's view of the agent
 * current. see docs/plans/embedded-agent-connection-plan.md
 */
export const AgentConnect = (): JSX.Element | null => {
  const folder = useEmbeddedStore((s) => s.folder);
  const status = useEmbeddedStore((s) => s.ownAgent);
  const open = useEmbeddedStore((s) => s.agentConnectOpen);
  const set = useEmbeddedStore((s) => s.set);
  const [copied, setCopied] = useState<string | null>(null);
  const write = useRef<((data: string) => void) | null>(null);
  // Stable, so the terminal isn't recreated on every render.
  const handleReady = useCallback((typeInto: (data: string) => void) => {
    write.current = typeInto;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let first = true;
    const load = (): void => {
      void window.scampEmbedded.ownAgentStatus().then((next) => {
        if (cancelled) return;
        const before = useEmbeddedStore.getState().ownAgent;
        const patch: { ownAgent: typeof next; agentConnectOpen?: boolean } = { ownAgent: next };
        // Starting with My agent chosen and nothing connected yet: show how to connect.
        if (first && next?.worker === 'own' && !next.seen) patch.agentConnectOpen = true;
        // Connected: get out of the way, into the Agent tab.
        if (before !== null && !before.seen && next?.seen === true) patch.agentConnectOpen = false;
        first = false;
        set(patch);
      });
    };
    load();
    // Whether the user's agent has connected changes outside this window: ask again.
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [set]);

  const handleCopy = async (text: string): Promise<void> => {
    await navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  if (folder === null || status === null || status.worker !== 'own') return null;
  const codexCommand = status.codexCommand;
  const state = status.working ? 'working' : status.seen ? 'connected' : 'waiting';
  return (
    <div className={styles.backdrop} hidden={!open} data-testid="embedded-agent-connect">
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="agent-connect-title">
        <header className={styles.head}>
          <h2 id="agent-connect-title" className={styles.title}>
            Connect your agent
          </h2>
          <span className={styles.state} data-state={state}>
            {state === 'working' ? 'Writing changes' : state === 'connected' ? 'Connected' : 'Waiting to connect'}
          </span>
          <IconButton icon={IconMinus} label="Minimize" tooltip="Minimize — The terminal keeps running; open it again from the Agent tab" onClick={() => set({ agentConnectOpen: false })} testId="embedded-agent-connect-minimize" />
        </header>
        <ol className={styles.steps}>
          <li>
            <div>
              Start your agent in the terminal below
              {status.written.length > 0 ? `. Scamp set it up in ${status.written.join(', ')}` : ''}. If it asks to use the{' '}
              <code>scamp</code> server, allow it.
              {status.codexTrusted === false && (
                <> If you start Codex yourself instead of with the button, choose Yes when it asks whether to trust this folder.</>
              )}
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.action} onClick={() => write.current?.('claude\r')} data-testid="embedded-terminal-start-claude">
                Start Claude Code
              </button>
              {status.codexTrusted !== null && codexCommand !== null && (
                <button type="button" className={styles.action} onClick={() => write.current?.(`${codexCommand}\r`)} data-testid="embedded-terminal-start-codex">
                  Start Codex
                </button>
              )}
            </div>
          </li>
          <li>
            <div>
              Give it the prompt, then press Enter:
              <span className={styles.copyRow}>
                <code className={styles.line}>{OWN_AGENT_LINE}</code>
                <button type="button" className={styles.copy} onClick={() => void handleCopy(OWN_AGENT_LINE)}>
                  {copied === OWN_AGENT_LINE ? 'Copied' : 'Copy'}
                </button>
              </span>
            </div>
            <button type="button" className={styles.action} onClick={() => write.current?.(OWN_AGENT_LINE)} data-testid="embedded-terminal-paste">
              Paste the prompt
            </button>
          </li>
        </ol>
        <div className={styles.terminal} data-testid="embedded-terminal">
          <TerminalView cwd={folder} api={window.scampEmbedded} onReady={handleReady} />
        </div>
        {status.skipped.some((s) => s.path === '.mcp.json') && status.command !== null && (
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
        <p className={styles.hint}>
          Using Cursor, Gemini CLI or Kiro? Start it in the terminal instead, and give it the same prompt. Once it connects, this window
          minimizes into the Agent tab.
        </p>
      </section>
    </div>
  );
};
