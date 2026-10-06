import { useEffect, useRef, useState } from 'react';
import { IconArrowBackUp, IconMessagePlus, IconPlayerStop, IconSend } from '@tabler/icons-react';

import { useAgentStore, currentAgentContext } from '@store/agentSlice';
import { useCanvasStore } from '@store/canvasSlice';

import { Tooltip } from '../controls/Tooltip';
import { AgentCleanupCard } from './AgentCleanupCard';
import { AgentConnect } from './AgentConnect';
import { AgentPlanBar } from './AgentPlanBar';
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
  'Center this element’s contents',
  'Use theme tokens for this element’s colors',
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
  const { entries, busy, sendError, send, cancel, reset, edited, undoSession, lastImport, cleanupPhase } =
    useAgentStore();
  const openViewName = useCanvasStore((s) => s.activeComponent?.name ?? null);
  // Offered for the view imported most recently, while it's the one open.
  const cleanupOffer =
    lastImport !== null && lastImport.projectPath === projectPath && lastImport.viewName === openViewName
      ? lastImport
      : null;
  const [confirmingUndo, setConfirmingUndo] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
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

  const handleUndo = async (): Promise<void> => {
    const result = await undoSession();
    setConfirmingUndo(false);
    setUndoError(result.ok ? null : result.error);
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
          <div className={styles.headerActions}>
          {edited && (
            <Tooltip label="Undo AI changes">
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setConfirmingUndo(true)}
                disabled={busy || confirmingUndo}
                aria-label="Undo AI changes"
              >
                <IconArrowBackUp size={14} />
              </button>
            </Tooltip>
          )}
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
          </div>
        )}
      </header>

      {confirmingUndo && (
        <div className={styles.confirm} role="alertdialog" aria-label="Undo AI changes" data-testid="agent-undo-confirm">
          <p className={styles.confirmText}>
            Undo every change the agent made in this conversation? Pages, components, the theme, and
            DESIGN.md go back to how they were before its first edit.
          </p>
          <div className={styles.confirmActions}>
            <button type="button" className={styles.secondaryButton} onClick={() => setConfirmingUndo(false)}>
              Keep changes
            </button>
            <button type="button" className={styles.primaryButton} onClick={() => void handleUndo()}>
              Undo changes
            </button>
          </div>
        </div>
      )}
      {undoError !== null && (
        <p className={`${styles.replyError} ${styles.bannerError}`} role="alert">
          {undoError}
        </p>
      )}

      {keyControls.status === null ? null : !connected ? (
        <AgentConnect keyControls={keyControls} />
      ) : (
        <>
          <div className={styles.messages} ref={listRef} data-testid="agent-messages">
            {visible.length === 0 && cleanupOffer !== null ? (
              <AgentCleanupCard projectPath={cleanupOffer.projectPath} viewName={cleanupOffer.viewName} />
            ) : visible.length === 0 ? (
              <div className={styles.empty}>
                <p className={styles.emptyText}>
                  Ask about the page you’re designing, or ask for a change. Each reply’s edits undo together
                  with Cmd+Z.
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
                ) : entry.role === 'note' ? (
                  <p key={entry.id} className={styles.note} data-testid="agent-note">
                    {entry.text}
                  </p>
                ) : (
                  <AgentReply key={entry.id} entry={entry} />
                )
              )
            )}
            {cleanupPhase === 'awaiting-approval' && !busy && <AgentPlanBar />}
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
                placeholder="Ask or describe a change…"
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
