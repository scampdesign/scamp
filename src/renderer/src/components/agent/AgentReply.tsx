import { useEffect, useState } from 'react';
import { IconCheck, IconCopy, IconLoader2, IconX } from '@tabler/icons-react';

import {
  formatUsage,
  replyText,
  toolLabel,
  type TranscriptEntry,
  type TranscriptPart,
} from '@lib/agentTranscript';

import { Tooltip } from '../controls/Tooltip';
import { AgentMarkdown } from './AgentMarkdown';
import styles from './AgentPanel.module.css';

type Props = {
  entry: Extract<TranscriptEntry, { role: 'assistant' }>;
};

/** What a turn that didn't simply finish has to say for itself. */
const OUTCOME_NOTE: Partial<Record<Props['entry']['status'], string>> = {
  cancelled: 'Stopped.',
  refusal: 'Claude declined this request.',
};

const ConfirmCard = ({
  part,
}: {
  part: Extract<TranscriptPart, { kind: 'confirm' }>;
}): JSX.Element => {
  const answer = (approved: boolean): void => {
    void window.scamp.agentConfirm({ confirmId: part.id, approved });
  };
  return (
    <div className={styles.confirmCard} data-testid="agent-confirm" data-state={part.state}>
      <p className={styles.confirmText}>
        {part.state === 'pending'
          ? 'The agent wants to make these changes:'
          : part.state === 'approved'
            ? 'You approved these changes:'
            : 'You declined these changes:'}
      </p>
      <ul className={styles.confirmItems}>
        {part.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      {part.state === 'pending' && (
        <div className={styles.confirmActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => answer(false)}>
            Cancel
          </button>
          <button type="button" className={styles.primaryButton} onClick={() => answer(true)}>
            Apply changes
          </button>
        </div>
      )}
    </div>
  );
};

/** One reply: its text and tool calls in order, then how it ended. */
export const AgentReply = ({ entry }: Props): JSX.Element => {
  const working = entry.status === 'working';
  const text = replyText(entry);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = (): void => {
    void window.scamp
      .writeClipboard({ text })
      // Only claim success when the write actually happened.
      .then(() => setCopied(true))
      .catch(() => undefined);
  };

  const asking = entry.parts.some((part) => part.kind === 'confirm' && part.state === 'pending');
  const note = entry.message ?? OUTCOME_NOTE[entry.status];
  return (
    <div className={styles.reply} data-testid="agent-reply" data-status={entry.status}>
      {entry.parts.map((part, i) =>
        part.kind === 'text' ? (
          <AgentMarkdown key={i} text={part.text} />
        ) : part.kind === 'confirm' ? (
          <ConfirmCard key={part.id} part={part} />
        ) : (
          <ul key={i} className={styles.tools}>
            {part.calls.map((call) => (
              <li key={call.id} className={styles.tool} data-testid="agent-tool">
                {call.status === 'running' ? (
                  <IconLoader2 size={12} className={styles.spin} aria-hidden />
                ) : call.status === 'ok' ? (
                  <IconCheck size={12} aria-hidden />
                ) : (
                  <IconX size={12} aria-hidden />
                )}
                {call.summary ?? toolLabel(call.name)}
              </li>
            ))}
          </ul>
        )
      )}
      {working && (
        <p className={styles.progress} aria-live="polite">
          {asking
            ? 'Waiting for your answer.'
            : entry.progress.trim().length > 0
              ? entry.progress.trim()
              : 'Thinking…'}
        </p>
      )}
      {!working && note !== undefined && entry.status !== 'done' && (
        <p className={entry.status === 'error' ? styles.replyError : styles.replyNote} role="status">
          {note}
        </p>
      )}
      {!working && (entry.usage !== undefined || text.length > 0) && (
        <div className={styles.replyFooter}>
          {entry.usage !== undefined && <p className={styles.usage}>{formatUsage(entry.usage)}</p>}
          {text.length > 0 && (
            <Tooltip label={copied ? 'Copied' : 'Copy reply'}>
              <button
                type="button"
                className={styles.iconButton}
                onClick={handleCopy}
                aria-label="Copy reply"
                data-testid="agent-copy-reply"
              >
                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              </button>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
};
