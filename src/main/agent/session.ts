import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';

import type { AgentEvent, AgentSendResult } from '@shared/types';

import type { ToolInvoker } from '../mcp/protocol';
import { runTurn } from './harness';
import type { AgentProvider } from './provider';

/**
 * One project's conversation with the agent: its history, the turn in
 * flight, and how to stop it. One turn at a time.
 *
 * Electron-free — the IPC layer hands it a way to emit events and a way
 * to get a provider, so a test can drive it end to end.
 * see docs/plans/builtin-agent-plan.md
 */
export type AgentSessionDeps = {
  /** Null when there's no usable key. */
  getProvider: () => Promise<AgentProvider | null>;
  invoke: ToolInvoker;
  system: string;
  tools: Parameters<typeof runTurn>[0]['tools'];
  emit: (event: AgentEvent) => void;
  /** The provider rejected the key mid-conversation. */
  onKeyRejected: () => void;
};

export type AgentSession = {
  send: (text: string, context: string, turnId: string) => Promise<AgentSendResult>;
  cancel: () => void;
  reset: () => void;
  /** For tests. */
  history: () => ReadonlyArray<BetaMessageParam>;
  /** Resolves when the turn in flight ends. For tests. */
  idle: () => Promise<void>;
};

/** The user's words, with the line Scamp adds in front of them. */
export const userContentFor = (text: string, context: string): string =>
  context.trim().length > 0 ? `[Scamp: ${context.trim()}]\n\n${text}` : text;

export const createAgentSession = (deps: AgentSessionDeps): AgentSession => {
  let history: BetaMessageParam[] = [];
  let inFlight: { controller: AbortController; done: Promise<void> } | null = null;
  let generation = 0;

  return {
    send: async (text, context, turnId) => {
      if (inFlight !== null) {
        return { ok: false, reason: 'busy', message: 'The agent is still working on your last message.' };
      }
      // Claim the slot before the first await, or two quick sends both
      // pass the check above.
      const controller = new AbortController();
      let finish: () => void = () => {};
      inFlight = { controller, done: new Promise<void>((resolve) => (finish = resolve)) };

      const provider = await deps.getProvider();
      if (provider === null) {
        inFlight = null;
        finish();
        return {
          ok: false,
          reason: 'not-connected',
          message: 'Connect your Claude API key in Settings to use the agent.',
        };
      }
      const startedIn = generation;
      void (async () => {
        try {
          const result = await runTurn({
            provider,
            system: deps.system,
            tools: deps.tools,
            invoke: deps.invoke,
            history,
            userContent: userContentFor(text, context),
            effort: 'medium',
            signal: controller.signal,
            emit: (event) => deps.emit({ ...event, turnId }),
          });
          // A reset during the turn started a new conversation; this turn's
          // history belongs to the old one.
          if (generation === startedIn) history = result.history;
          if (result.keyRejected === true) deps.onKeyRejected();
          deps.emit({
            kind: 'turn-end',
            turnId,
            outcome: result.outcome,
            usage: result.usage,
            ...(result.message !== undefined ? { message: result.message } : {}),
          });
        } catch (err) {
          // Something the harness didn't expect — a tool that threw rather
          // than returning an error. The turn still has to end, or the
          // panel waits forever and every later message is "busy".
          deps.emit({
            kind: 'turn-end',
            turnId,
            outcome: 'error',
            usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
            message: `Something went wrong in Scamp: ${err instanceof Error ? err.message : String(err)}`,
          });
        } finally {
          inFlight = null;
          finish();
        }
      })();
      return { ok: true };
    },

    cancel: () => {
      inFlight?.controller.abort();
    },

    reset: () => {
      inFlight?.controller.abort();
      generation += 1;
      history = [];
    },

    history: () => history,

    idle: async () => {
      await inFlight?.done;
    },
  };
};
