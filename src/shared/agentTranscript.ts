import type { AgentEvent, AgentTurnOutcome, AgentUsage } from './types';

/**
 * The Scamp Agent conversation as the panel shows it, built from the
 * events main streams back. Pure and shared: the panel folds events into
 * it as they arrive, and main folds the same events to keep each page's
 * conversation on disk.
 * see docs/archive/2026-10-06-builtin-agent-plan.md
 */

export type TranscriptToolCall = {
  id: string;
  name: string;
  status: 'running' | 'ok' | 'failed';
  /** What an edit changed, when it says. Shown instead of the tool's label. */
  summary?: string;
};

/** A reply is text and tool calls interleaved, in the order they happened. */
export type TranscriptPart =
  | { kind: 'text'; text: string }
  | { kind: 'tools'; calls: TranscriptToolCall[] }
  /** Edits waiting on the user's say-so, and what they said. */
  | { kind: 'confirm'; id: string; items: string[]; state: 'pending' | 'approved' | 'declined' };

export type TranscriptEntry =
  | { role: 'user'; id: string; text: string; context: string }
  /** Something Scamp did, said in the conversation — "Undid the agent's changes." */
  | { role: 'note'; id: string; text: string }
  | {
      role: 'assistant';
      /** The turn id main assigned. */
      id: string;
      parts: TranscriptPart[];
      /** The agent's current note on what it's doing; cleared as it acts. */
      progress: string;
      status: 'working' | AgentTurnOutcome;
      message?: string;
      usage?: AgentUsage;
    };

type AssistantEntry = Extract<TranscriptEntry, { role: 'assistant' }>;

/** A user message and the reply it's waiting for. */
export const startTurn = (
  entries: ReadonlyArray<TranscriptEntry>,
  turnId: string,
  text: string,
  context: string
): TranscriptEntry[] => [
  ...entries,
  { role: 'user', id: `${turnId}:user`, text, context },
  { role: 'assistant', id: turnId, parts: [], progress: '', status: 'working' },
];

const withLastPart = (
  parts: ReadonlyArray<TranscriptPart>,
  kind: TranscriptPart['kind'],
  update: (part: TranscriptPart | null) => TranscriptPart
): TranscriptPart[] => {
  const last = parts.at(-1);
  if (last !== undefined && last.kind === kind) return [...parts.slice(0, -1), update(last)];
  return [...parts, update(null)];
};

const reduceAssistant = (entry: AssistantEntry, event: AgentEvent): AssistantEntry => {
  switch (event.kind) {
    case 'text':
      return {
        ...entry,
        progress: '',
        parts: withLastPart(entry.parts, 'text', (part) => ({
          kind: 'text',
          text: (part?.kind === 'text' ? part.text : '') + event.text,
        })),
      };
    case 'progress':
      return { ...entry, progress: entry.progress + event.text };
    case 'tool-start':
      return {
        ...entry,
        progress: '',
        parts: withLastPart(entry.parts, 'tools', (part) => ({
          kind: 'tools',
          calls: [
            ...(part?.kind === 'tools' ? part.calls : []),
            { id: event.toolId, name: event.name, status: 'running' },
          ],
        })),
      };
    case 'tool-end':
      return {
        ...entry,
        parts: entry.parts.map((part) =>
          part.kind !== 'tools'
            ? part
            : {
                kind: 'tools',
                calls: part.calls.map((call) =>
                  call.id === event.toolId
                    ? {
                        ...call,
                        status: event.ok ? 'ok' : 'failed',
                        ...(event.summary !== undefined ? { summary: event.summary } : {}),
                      }
                    : call
                ),
              }
        ),
      };
    case 'confirm-request':
      return {
        ...entry,
        progress: '',
        parts: [...entry.parts, { kind: 'confirm', id: event.confirmId, items: event.items, state: 'pending' }],
      };
    case 'confirm-resolved':
      return {
        ...entry,
        parts: entry.parts.map((part) =>
          part.kind === 'confirm' && part.id === event.confirmId
            ? { ...part, state: event.approved ? 'approved' : 'declined' }
            : part
        ),
      };
    case 'turn-end':
      return {
        ...entry,
        progress: '',
        status: event.outcome,
        usage: event.usage,
        ...(event.message !== undefined ? { message: event.message } : {}),
      };
  }
};

/**
 * Fold one event in. An event for a turn the transcript doesn't have — one
 * from before a reset — is ignored.
 */
export const applyAgentEvent = (
  entries: ReadonlyArray<TranscriptEntry>,
  event: AgentEvent
): TranscriptEntry[] =>
  entries.map((entry) =>
    entry.role === 'assistant' && entry.id === event.turnId ? reduceAssistant(entry, event) : entry
  );

/**
 * A transcript read back from disk, made safe to show: a reply that was
 * still working when it was saved can't finish now, and a question it
 * asked can't be answered.
 */
export const settleTranscript = (entries: ReadonlyArray<TranscriptEntry>): TranscriptEntry[] =>
  entries.map((entry) =>
    entry.role !== 'assistant' || entry.status !== 'working'
      ? entry
      : {
          ...entry,
          progress: '',
          status: 'cancelled',
          message: 'Stopped before it finished.',
          parts: entry.parts.map((part) =>
            part.kind === 'confirm' && part.state === 'pending' ? { ...part, state: 'declined' } : part
          ),
        }
  );
