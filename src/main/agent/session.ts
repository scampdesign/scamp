import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';

import type { AgentEvent, AgentSendResult } from '@shared/types';

import { describeToolCall, needsConfirmation } from './confirmPolicy';
import { runTurn, type AgentToolInvoker } from './harness';
import { WRITE_TOOL_NAMES } from './writeTools';
import type { AgentSkill } from './skills/skill';
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
  /** Runs a tool for a turn — edits need the turn, to undo it as one step. */
  invoke: (
    name: string,
    args: Record<string, unknown>,
    turnId: string
  ) => ReturnType<AgentToolInvoker>;
  system: string;
  tools: Parameters<typeof runTurn>[0]['tools'];
  emit: (event: AgentEvent) => void;
  /** The provider rejected the key mid-conversation. */
  onKeyRejected: () => void;
  /** A conversation read back from disk, to continue. */
  initial?: { history: ReadonlyArray<BetaMessageParam>; skill: AgentSkill | null };
};

export type AgentSession = {
  /**
   * `skill` starts a skill for the rest of the conversation; ignored if
   * one is already running. `endSkill` ends the running one: its work is
   * done, and this message is ordinary chat.
   */
  send: (
    text: string,
    context: string,
    turnId: string,
    options?: { skill?: AgentSkill; endSkill?: boolean }
  ) => Promise<AgentSendResult>;
  /** The skill this conversation runs, if any. */
  skill: () => AgentSkill | null;
  cancel: () => void;
  reset: () => void;
  /** A turn is in flight. */
  isBusy: () => boolean;
  /** The user's answer to a confirmation request. */
  answer: (confirmId: string, approved: boolean) => void;
  /**
   * Something the agent should know before the user's next message — that
   * its edits were undone, say. Rides in front of that message, once.
   */
  noteNextTurn: (note: string) => void;
  /** For tests. */
  history: () => ReadonlyArray<BetaMessageParam>;
  /** Resolves when the turn in flight ends. For tests. */
  idle: () => Promise<void>;
};

/** The user's words, with the lines Scamp adds in front of them. */
export const userContentFor = (text: string, context: string, note: string | null = null): string => {
  const lines = [
    ...(note !== null ? [`[Scamp: ${note}]`] : []),
    ...(context.trim().length > 0 ? [`[Scamp: ${context.trim()}]`] : []),
  ];
  return lines.length > 0 ? `${lines.join('\n')}\n\n${text}` : text;
};

/** Told to the model when a skill's session ends and ordinary chat resumes. */
export const SKILL_ENDED_NOTE =
  'That session is over, and its instructions and limits no longer apply. You have every Scamp tool again, including edits to any view in the project; follow your standing instructions from here.';

export const createAgentSession = (deps: AgentSessionDeps): AgentSession => {
  let history: BetaMessageParam[] = [...(deps.initial?.history ?? [])];
  let inFlight: { controller: AbortController; done: Promise<void> } | null = null;
  let generation = 0;
  let pendingNote: string | null = null;
  let skill: AgentSkill | null = deps.initial?.skill ?? null;
  /** Confirmations waiting on the user, by id. */
  const waiting = new Map<string, (approved: boolean) => void>();
  let confirmCounter = 0;

  return {
    send: async (text, context, turnId, options = {}) => {
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
      const note = pendingNote;
      pendingNote = null;
      const startsSkill = skill === null && options.skill !== undefined;
      const ended = !startsSkill && options.endSkill === true ? skill : null;
      if (startsSkill && options.skill !== undefined) skill = options.skill;
      if (ended !== null) skill = null;
      const active = skill;
      // Its instructions stay in the history, so say they're over.
      const systemNote =
        startsSkill && active !== null
          ? active.instructions
          : ended !== null
            ? SKILL_ENDED_NOTE
            : undefined;
      void (async () => {
        try {
          const result = await runTurn({
            provider,
            system: deps.system,
            tools: active !== null ? active.tools(deps.tools) : deps.tools,
            invoke: async (name, args) =>
              active !== null && !active.allows(name)
                ? {
                    content: [{ type: 'text', text: `${name} is off for this ${active.id} session.` }],
                    isError: true,
                  }
                : deps.invoke(name, args, turnId),
            history,
            userContent: userContentFor(text, context, note),
            effort: active?.effort ?? 'medium',
            ...(systemNote !== undefined ? { systemNote } : {}),
            signal: controller.signal,
            emit: (event) => deps.emit({ ...event, turnId }),
            review: async (calls) => {
              if (!needsConfirmation(calls, { planApproved: active?.planApproved === true })) return true;
              if (controller.signal.aborted) return false;
              confirmCounter += 1;
              const confirmId = `${turnId}:confirm_${confirmCounter}`;
              const items = calls.filter((c) => WRITE_TOOL_NAMES.has(c.name)).map(describeToolCall);
              deps.emit({ kind: 'confirm-request', turnId, confirmId, items });
              const approved = await new Promise<boolean>((resolve) => {
                waiting.set(confirmId, resolve);
                // Stop and New conversation decline anything still asked.
                controller.signal.addEventListener('abort', () => resolve(false), { once: true });
              });
              waiting.delete(confirmId);
              deps.emit({ kind: 'confirm-resolved', turnId, confirmId, approved });
              return approved;
            },
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
      pendingNote = null;
      skill = null;
    },

    isBusy: () => inFlight !== null,

    skill: () => skill,

    answer: (confirmId, approved) => {
      waiting.get(confirmId)?.(approved);
    },

    noteNextTurn: (note) => {
      pendingNote = note;
    },

    history: () => history,

    idle: async () => {
      await inFlight?.done;
    },
  };
};
