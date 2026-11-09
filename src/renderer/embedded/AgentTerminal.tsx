import { useCallback, useRef } from 'react';

import { OWN_AGENT_LINE } from '@shared/embedded';

import { TerminalView } from '../src/components/TerminalView';
import { useEmbeddedStore } from './embeddedStore';
import styles from './AgentTerminal.module.css';

/**
 * A terminal in the project's folder, beside the agent choice, so starting
 * the user's own agent and giving it the line happens without leaving Scamp.
 */
export const AgentTerminal = (): JSX.Element | null => {
  const folder = useEmbeddedStore((s) => s.folder);
  const write = useRef<((data: string) => void) | null>(null);
  // Stable, so the terminal isn't recreated on every render.
  const handleReady = useCallback((typeInto: (data: string) => void) => {
    write.current = typeInto;
  }, []);

  if (folder === null) return null;
  return (
    <div className={styles.wrap}>
      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={() => write.current?.('claude\r')} data-testid="embedded-terminal-start-claude">
          Start Claude Code
        </button>
        <button type="button" className={styles.action} onClick={() => write.current?.(OWN_AGENT_LINE)} data-testid="embedded-terminal-paste">
          Paste the prompt
        </button>
      </div>
      <div className={styles.terminal} data-testid="embedded-terminal">
        <TerminalView cwd={folder} api={window.scampEmbedded} onReady={handleReady} />
      </div>
      <p className={styles.hint}>Using another agent? Start it here instead, then paste the prompt and press Enter.</p>
    </div>
  );
};
