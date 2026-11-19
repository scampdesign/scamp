import { useState } from 'react';

import { AgentMarkdown } from '../src/components/agent/AgentMarkdown';
import { useEmbeddedStore } from './embeddedStore';
import { sendInstruction, undoTurn } from './session';
import styles from './AgentChat.module.css';

const STATUS: Record<string, string> = { running: 'Working…', error: 'Stopped with an error', stopped: 'Stopped', undone: 'Undone' };

/**
 * The conversation with the agent: each batch it took, what it said and
 * did, and an undo per turn; a reply goes in the queue like an instruction.
 * see docs/plans/embedded-canvas-gaps.md (gap 13)
 */
export const AgentChat = (): JSX.Element => {
  const chat = useEmbeddedStore((s) => s.chat);
  const paused = useEmbeddedStore((s) => s.agent.paused);
  const [reply, setReply] = useState('');

  const handleSend = async (): Promise<void> => {
    await sendInstruction(reply);
    setReply('');
  };

  return (
    <div className={styles.chat} data-testid="embedded-chat">
      {chat.length === 0 && <p className={styles.empty}>Your edits and the agent’s replies appear here as it works.</p>}
      {chat.map((turn) =>
        turn.role === 'user' ? (
          <div key={turn.id} className={styles.user}>
            {turn.lines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        ) : (
          <div key={turn.id} className={styles.agent} data-status={turn.status} data-testid="embedded-chat-agent">
            {turn.text.trim().length > 0 && <AgentMarkdown text={turn.text.trim()} />}
            {turn.tools.length > 0 && (
              <details className={styles.tools}>
                <summary>{turn.tools.length === 1 ? '1 step' : `${turn.tools.length} steps`}</summary>
                {turn.tools.map((tool, i) => (
                  <p key={i} data-ok={tool.ok}>
                    {tool.text}
                  </p>
                ))}
              </details>
            )}
            <div className={styles.foot}>
              {STATUS[turn.status] !== undefined && <span className={styles.status}>{turn.message ?? STATUS[turn.status]}</span>}
              {turn.runId !== undefined && turn.status !== 'undone' && turn.status !== 'running' && (
                <button type="button" className={styles.undo} onClick={() => void undoTurn(turn.runId ?? '')} data-testid="embedded-chat-undo">
                  Undo
                </button>
              )}
            </div>
          </div>
        )
      )}
      <form
        className={styles.reply}
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <textarea
          className={styles.input}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder={paused ? 'Reply to the agent. It runs when you resume.' : 'Reply to the agent'}
          rows={2}
          data-testid="embedded-chat-reply"
        />
      </form>
    </div>
  );
};
