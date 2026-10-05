import { useEffect, useRef, useState } from 'react';
import { IconMessagePlus, IconPlayerStop, IconSend } from '@tabler/icons-react';

import { useAgentStore, currentAgentContext } from '@store/agentSlice';
import { useCanvasStore } from '@store/canvasSlice';

import { Tooltip } from '../controls/Tooltip';
import { AgentConnect } from './AgentConnect';
import { AgentReply } from './AgentReply';
import { useAgentKey } from './useAgentKey';
import styles from './AgentPanel.module.css';

/**
 * The Scamp Agent, in the left sidebar. Signed-in users only — the rail
 * doesn't offer it otherwise.
 * see docs/plans/builtin-agent-plan.md
 */

/** Starting points, which change with what's selected. */
const SUGGESTIONS_WITH_SELECTION = [
  'What styles does this element have?',
  'Why isn’t this element where I expect it?',
  'Which theme tokens could this element use?',
];
const SUGGESTIONS_WITHOUT_SELECTION = [
  'What’s on this page?',
  'Which elements don’t use theme tokens?',
  'What did this page lose when it was imported?',
];

export const AgentPanel = (): JSX.Element => {
  const keyControls = useAgentKey(true);
  const projectPath = useCanvasStore((s) => s.projectPath);
  const hasSelection = useCanvasStore((s) => s.selectedElementIds.length > 0);
  // Recomputed from the canvas on every store change; a string, so the
  // panel only re-renders when the line actually changes.
  const context = useCanvasStore(() => currentAgentContext());
  const { entries, busy, sendError, send, cancel, reset } = useAgentStore();
  const conversationProject = useAgentStore((s) => s.projectPath);
  const visible = conversationProject === projectPath ? entries : [];
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list !== null) list.scrollTop = list.scrollHeight;
  }, [visible]);

  const connected = keyControls.status === 'connected' || keyControls.status === 'session-only';

  const handleSend = (text: string): void => {
    if (text.trim().length === 0 || busy) return;
    void send(text);
    setDraft('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend(draft);
    }
  };

  return (
    <section className={styles.panel} data-testid="agent-panel" aria-label="Scamp Agent">
      <header className={styles.header}>
        <h2 className={styles.title}>
          Agent <span className={styles.beta}>Beta</span>
        </h2>
        {connected && (
          <Tooltip label="New conversation">
            <button
              type="button"
              className={styles.iconButton}
              onClick={reset}
              disabled={visible.length === 0}
              aria-label="New conversation"
            >
              <IconMessagePlus size={14} />
            </button>
          </Tooltip>
        )}
      </header>

      {keyControls.status === null ? null : !connected ? (
        <AgentConnect keyControls={keyControls} />
      ) : (
        <>
          <div className={styles.messages} ref={listRef} data-testid="agent-messages">
            {visible.length === 0 ? (
              <div className={styles.empty}>
                <p className={styles.emptyText}>
                  Ask about the page you’re designing. The agent can read the canvas; editing from the chat is
                  coming next.
                </p>
                <ul className={styles.suggestions}>
                  {(hasSelection ? SUGGESTIONS_WITH_SELECTION : SUGGESTIONS_WITHOUT_SELECTION).map((s) => (
                    <li key={s}>
                      <button type="button" className={styles.suggestion} onClick={() => handleSend(s)}>
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              visible.map((entry) =>
                entry.role === 'user' ? (
                  <div key={entry.id} className={styles.userMessage} data-testid="agent-user-message">
                    {entry.text}
                  </div>
                ) : (
                  <AgentReply key={entry.id} entry={entry} />
                )
              )
            )}
          </div>

          <footer className={styles.composer}>
            <p className={styles.context} data-testid="agent-context" title={context}>
              {context.length > 0 ? context : 'No page open'}
            </p>
            {sendError !== null && (
              <p className={styles.replyError} role="alert">
                {sendError}
              </p>
            )}
            <div className={styles.inputRow}>
              <textarea
                className={styles.input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about this page…"
                rows={3}
                aria-label="Message the agent"
              />
              {busy ? (
                <Tooltip label="Stop">
                  <button type="button" className={styles.sendButton} onClick={cancel} aria-label="Stop">
                    <IconPlayerStop size={14} />
                  </button>
                </Tooltip>
              ) : (
                <Tooltip label="Send">
                  <button
                    type="button"
                    className={styles.sendButton}
                    onClick={() => handleSend(draft)}
                    disabled={draft.trim().length === 0}
                    aria-label="Send"
                  >
                    <IconSend size={14} />
                  </button>
                </Tooltip>
              )}
            </div>
          </footer>
        </>
      )}
    </section>
  );
};
