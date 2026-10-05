import { IconCheck, IconLoader2, IconX } from '@tabler/icons-react';

import { formatUsage, splitInlineCode, toolLabel, type TranscriptEntry } from '@lib/agentTranscript';

import styles from './AgentPanel.module.css';

type Props = {
  entry: Extract<TranscriptEntry, { role: 'assistant' }>;
};

/** What a turn that didn't simply finish has to say for itself. */
const OUTCOME_NOTE: Partial<Record<Props['entry']['status'], string>> = {
  cancelled: 'Stopped.',
  refusal: 'Claude declined this request.',
};

const RichText = ({ text }: { text: string }): JSX.Element => (
  <p className={styles.replyText}>
    {splitInlineCode(text).map((segment, i) =>
      segment.code ? (
        <code key={i} className={styles.code}>
          {segment.text}
        </code>
      ) : (
        <span key={i}>{segment.text}</span>
      )
    )}
  </p>
);

/** One reply: its text and tool calls in order, then how it ended. */
export const AgentReply = ({ entry }: Props): JSX.Element => {
  const working = entry.status === 'working';
  const note = entry.message ?? OUTCOME_NOTE[entry.status];
  return (
    <div className={styles.reply} data-testid="agent-reply" data-status={entry.status}>
      {entry.parts.map((part, i) =>
        part.kind === 'text' ? (
          <RichText key={i} text={part.text} />
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
          {entry.progress.trim().length > 0 ? entry.progress.trim() : 'Thinking…'}
        </p>
      )}
      {!working && note !== undefined && entry.status !== 'done' && (
        <p className={entry.status === 'error' ? styles.replyError : styles.replyNote} role="status">
          {note}
        </p>
      )}
      {!working && entry.usage !== undefined && (
        <p className={styles.usage}>{formatUsage(entry.usage)}</p>
      )}
    </div>
  );
};
