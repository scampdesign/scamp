import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  BetaStopReason,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';

import type { AgentProvider } from './provider';

/**
 * A provider that plays back a script, for tests and the e2e suite — so
 * neither ever calls Anthropic or needs a key.
 *
 * `echo_tool_result` answers with the last tool result it was sent, which
 * is how a test proves a tool really ran in the renderer and its answer
 * really came back.
 */
export type ScriptedBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; name: string; input: Record<string, unknown> }
  | { type: 'echo_tool_result' }
  /** Answers with the start of the last system message — proof a skill arrived. */
  | { type: 'echo_system' };

export type ScriptedTurn = {
  content: ScriptedBlock[];
  stop_reason?: BetaStopReason;
  /** Throw this instead of answering — a provider failure. */
  error?: unknown;
};

const lastToolResult = (messages: ReadonlyArray<BetaMessageParam>): string => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const content = messages[i]?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type !== 'tool_result') continue;
      const parts = Array.isArray(block.content) ? block.content : [];
      return parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
    }
  }
  return '(no tool result)';
};

const lastSystem = (messages: ReadonlyArray<BetaMessageParam>): string => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === 'system' && typeof message.content === 'string') return message.content;
  }
  return '(no system message)';
};

export const createScriptedProvider = (
  script: ReadonlyArray<ScriptedTurn>
): AgentProvider & { requests: number } => {
  let next = 0;
  const provider = {
    requests: 0,
    streamTurn: async (
      request: Parameters<AgentProvider['streamTurn']>[0],
      callbacks: Parameters<AgentProvider['streamTurn']>[1]
    ): Promise<BetaMessage> => {
      provider.requests += 1;
      const turn = script[next] ?? { content: [{ type: 'text', text: '(end of script)' }] };
      next += 1;
      if (request.signal.aborted) throw new Error('aborted');
      if (turn.error !== undefined) throw turn.error;

      const content: BetaContentBlock[] = [];
      for (const [index, block] of turn.content.entries()) {
        if (block.type === 'tool_use') {
          content.push({
            type: 'tool_use',
            id: `toolu_scripted_${next}_${index}`,
            name: block.name,
            input: block.input,
            caller: { type: 'direct' },
          });
          continue;
        }
        const text =
          block.type === 'text'
            ? block.text
            : block.type === 'echo_system'
              ? `System: ${lastSystem(request.messages).slice(0, 80)}`
              : `Tool said: ${lastToolResult(request.messages).slice(0, 2000)}`;
        callbacks.onText(text);
        content.push({ type: 'text', text, citations: null });
      }

      const stop_reason: BetaStopReason =
        turn.stop_reason ?? (content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn');
      // A test double: the message carries the fields the harness reads,
      // not every field of a real response.
      return {
        id: `msg_scripted_${next}`,
        type: 'message',
        role: 'assistant',
        model: 'scripted',
        content,
        stop_reason,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      } as unknown as BetaMessage;
    },
  };
  return provider;
};
