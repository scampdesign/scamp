import type {
  BetaContentBlock,
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';

import type { AgentEvent, AgentTurnOutcome, AgentUsage } from '@shared/types';

import type { ToolResult } from '../mcp/protocol';
import type { AgentProvider } from './provider';
import { describeProviderError } from './providerErrors';

/**
 * One turn of the agent: the user's message, then as many model calls and
 * tool rounds as it takes to answer.
 *
 * The history is append-only. Thinking blocks are bound to the
 * conversation that produced them, so an earlier turn is never edited or
 * trimmed — and nothing is appended that would leave the history invalid
 * (a `tool_use` with no matching result), so a turn that ends early still
 * leaves a conversation the next message can continue.
 * see docs/plans/builtin-agent-plan.md
 */

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An event before the session stamps it with its turn. */
export type HarnessEvent = DistributiveOmit<AgentEvent, 'turnId'>;

/**
 * Runs one tool. An edit's result carries a one-line `summary` the panel
 * shows in place of the tool's name.
 */
export type AgentToolInvoker = (
  name: string,
  args: Record<string, unknown>
) => Promise<ToolResult & { summary?: string }>;

export type RunTurnOptions = {
  provider: AgentProvider;
  system: string;
  tools: BetaTool[];
  invoke: AgentToolInvoker;
  history: ReadonlyArray<BetaMessageParam>;
  userContent: string;
  effort: 'low' | 'medium' | 'high';
  signal: AbortSignal;
  emit: (event: HarnessEvent) => void;
  /** Model calls allowed for one user message. */
  maxSteps?: number;
};

export type RunTurnResult = {
  history: BetaMessageParam[];
  outcome: AgentTurnOutcome;
  usage: AgentUsage;
  message?: string;
  /** Set when the provider rejected the key, so the caller can say so in Settings. */
  keyRejected?: boolean;
};

export const DEFAULT_MAX_STEPS = 24;

const emptyUsage = (): AgentUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

const isToolUse = (block: BetaContentBlock): block is BetaToolUseBlock => block.type === 'tool_use';

const asArgs = (input: unknown): Record<string, unknown> | null =>
  input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;

export const runTurn = async (options: RunTurnOptions): Promise<RunTurnResult> => {
  const { provider, invoke, emit, signal } = options;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const history: BetaMessageParam[] = [
    ...options.history,
    { role: 'user', content: options.userContent },
  ];
  const usage = emptyUsage();
  const end = (outcome: AgentTurnOutcome, message?: string): RunTurnResult => ({
    history,
    outcome,
    usage,
    ...(message !== undefined ? { message } : {}),
  });

  for (let step = 0; step < maxSteps; step += 1) {
    if (signal.aborted) return end('cancelled');

    let response;
    try {
      response = await provider.streamTurn(
        {
          system: options.system,
          tools: options.tools,
          messages: history,
          effort: options.effort,
          signal,
        },
        {
          onText: (text) => emit({ kind: 'text', text }),
          onProgress: (text) => emit({ kind: 'progress', text }),
        }
      );
    } catch (err) {
      if (signal.aborted) return end('cancelled');
      const described = describeProviderError(err);
      return {
        ...end('error', described.message),
        ...(described.reason === 'invalid-key' ? { keyRejected: true } : {}),
      };
    }

    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;
    usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;

    const toolUses = response.content.filter(isToolUse);
    const keep = (): void => {
      if (response.content.length > 0) history.push({ role: 'assistant', content: response.content });
    };

    switch (response.stop_reason) {
      case 'tool_use':
        break;
      case 'pause_turn':
        keep();
        continue;
      case 'refusal':
        // A refusal can cut a tool call off mid-input: never run it, and
        // never keep a tool_use there will be no result for.
        if (toolUses.length === 0) keep();
        return end('refusal', 'Claude declined this request.');
      case 'max_tokens':
        if (toolUses.length === 0) keep();
        return end('max-tokens', 'The reply was too long and was cut off.');
      default:
        keep();
        return end('done');
    }

    keep();
    // Every tool result goes back in ONE user message. Splitting them
    // teaches the model to stop calling tools in parallel.
    const results = await Promise.all(
      toolUses.map(async (use): Promise<BetaToolResultBlockParam> => {
        emit({ kind: 'tool-start', toolId: use.id, name: use.name });
        const args = asArgs(use.input);
        const result =
          args === null
            ? { content: [{ type: 'text' as const, text: 'The tool input must be a JSON object.' }], isError: true }
            : await invoke(use.name, args);
        const ok = result.isError !== true;
        const summary = 'summary' in result ? result.summary : undefined;
        emit({
          kind: 'tool-end',
          toolId: use.id,
          name: use.name,
          ok,
          ...(ok && summary !== undefined ? { summary } : {}),
        });
        return {
          type: 'tool_result',
          tool_use_id: use.id,
          content: result.content.map((c) => ({ type: 'text' as const, text: c.text })),
          ...(ok ? {} : { is_error: true }),
        };
      })
    );
    history.push({ role: 'user', content: results });
  }

  return end('too-many-steps', 'This took more steps than one message allows. Ask again to continue.');
};
