import { describeToolCall, needsConfirmation } from './confirmPolicy';
import { runTurn } from './harness';
import { WRITE_TOOL_NAMES } from './writeTools';
/** The user's words, with the lines Scamp adds in front of them. */
export const userContentFor = (text, context, note = null) => {
    const lines = [
        ...(note !== null ? [`[Scamp: ${note}]`] : []),
        ...(context.trim().length > 0 ? [`[Scamp: ${context.trim()}]`] : []),
    ];
    return lines.length > 0 ? `${lines.join('\n')}\n\n${text}` : text;
};
export const createAgentSession = (deps) => {
    let history = [...(deps.initial?.history ?? [])];
    let inFlight = null;
    let generation = 0;
    let pendingNote = null;
    let skill = deps.initial?.skill ?? null;
    /** Confirmations waiting on the user, by id. */
    const waiting = new Map();
    let confirmCounter = 0;
    return {
        send: async (text, context, turnId, options = {}) => {
            if (inFlight !== null) {
                return { ok: false, reason: 'busy', message: 'The agent is still working on your last message.' };
            }
            // Claim the slot before the first await, or two quick sends both
            // pass the check above.
            const controller = new AbortController();
            let finish = () => { };
            inFlight = { controller, done: new Promise((resolve) => (finish = resolve)) };
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
            if (startsSkill && options.skill !== undefined)
                skill = options.skill;
            const active = skill;
            void (async () => {
                try {
                    const result = await runTurn({
                        provider,
                        system: deps.system,
                        tools: active !== null ? active.tools(deps.tools) : deps.tools,
                        invoke: async (name, args) => active !== null && !active.allows(name)
                            ? {
                                content: [{ type: 'text', text: `${name} is off for this ${active.id} session.` }],
                                isError: true,
                            }
                            : deps.invoke(name, args, turnId),
                        history,
                        userContent: userContentFor(text, context, note),
                        effort: active?.effort ?? 'medium',
                        ...(startsSkill && active !== null ? { systemNote: active.instructions } : {}),
                        signal: controller.signal,
                        emit: (event) => deps.emit({ ...event, turnId }),
                        review: async (calls) => {
                            if (!needsConfirmation(calls, { planApproved: active?.planApproved === true }))
                                return true;
                            if (controller.signal.aborted)
                                return false;
                            confirmCounter += 1;
                            const confirmId = `${turnId}:confirm_${confirmCounter}`;
                            const items = calls.filter((c) => WRITE_TOOL_NAMES.has(c.name)).map(describeToolCall);
                            deps.emit({ kind: 'confirm-request', turnId, confirmId, items });
                            const approved = await new Promise((resolve) => {
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
                    if (generation === startedIn)
                        history = result.history;
                    if (result.keyRejected === true)
                        deps.onKeyRejected();
                    deps.emit({
                        kind: 'turn-end',
                        turnId,
                        outcome: result.outcome,
                        usage: result.usage,
                        ...(result.message !== undefined ? { message: result.message } : {}),
                    });
                }
                catch (err) {
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
                }
                finally {
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
