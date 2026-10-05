import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';

import type { AgentEvent } from '@shared/types';
import { runTurn, type HarnessEvent } from '../src/main/agent/harness';
import { createScriptedProvider, type ScriptedTurn } from '../src/main/agent/scriptedProvider';
import { createAgentSession, userContentFor } from '../src/main/agent/session';
import { agentToolsFrom } from '../src/main/agent/agentTools';
import type { ToolInvoker } from '../src/main/mcp/protocol';
import { TOOL_DESCRIPTORS } from '../src/main/mcp/tools';

/**
 * The agent loop, against a scripted provider — no network, no key.
 * see docs/plans/builtin-agent-plan.md
 */

const TREE = '{"id":"root","children":[{"id":"a1b2","class":"rect_a1b2"}]}';

const fakeInvoke = (calls: string[] = []): ToolInvoker => async (name, args) => {
  calls.push(`${name}(${JSON.stringify(args)})`);
  if (name === 'scamp_get_element_tree') return { content: [{ type: 'text', text: TREE }] };
  return { content: [{ type: 'text', text: `no such element: ${String(args['id'])}` }], isError: true };
};

const run = async (
  script: ScriptedTurn[],
  over: { history?: BetaMessageParam[]; invoke?: ToolInvoker; maxSteps?: number; signal?: AbortSignal } = {}
): Promise<{ result: Awaited<ReturnType<typeof runTurn>>; events: HarnessEvent[] }> => {
  const events: HarnessEvent[] = [];
  const result = await runTurn({
    provider: createScriptedProvider(script),
    system: 'test',
    tools: [],
    invoke: over.invoke ?? fakeInvoke(),
    history: over.history ?? [],
    userContent: 'What is on this page?',
    effort: 'medium',
    signal: over.signal ?? new AbortController().signal,
    emit: (e) => events.push(e),
    ...(over.maxSteps !== undefined ? { maxSteps: over.maxSteps } : {}),
  });
  return { result, events };
};

describe('runTurn', () => {
  it('answers in one call when no tool is needed', async () => {
    const { result, events } = await run([{ content: [{ type: 'text', text: 'Hello.' }] }]);
    expect(result.outcome).toBe('done');
    expect(events).toEqual([{ kind: 'text', text: 'Hello.' }]);
    expect(result.history.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('runs a tool, sends the result back, and finishes', async () => {
    const calls: string[] = [];
    const { result, events } = await run(
      [
        { content: [{ type: 'tool_use', name: 'scamp_get_element_tree', input: {} }] },
        { content: [{ type: 'echo_tool_result' }] },
      ],
      { invoke: fakeInvoke(calls) }
    );
    expect(calls).toEqual(['scamp_get_element_tree({})']);
    expect(result.outcome).toBe('done');
    expect(events.map((e) => e.kind)).toEqual(['tool-start', 'tool-end', 'text']);
    // The model saw what the tool returned.
    expect(events[2]).toEqual({ kind: 'text', text: `Tool said: ${TREE}` });
    expect(result.history.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('returns every parallel tool result in one user message', async () => {
    const { result } = await run([
      {
        content: [
          { type: 'tool_use', name: 'scamp_get_element_tree', input: {} },
          { type: 'tool_use', name: 'scamp_get_element_by_id', input: { id: 'zzzz' } },
        ],
      },
      { content: [{ type: 'text', text: 'Done.' }] },
    ]);
    const toolResults = result.history[2];
    expect(toolResults?.role).toBe('user');
    expect(Array.isArray(toolResults?.content) ? toolResults.content.length : 0).toBe(2);
  });

  it('marks a failed tool as an error result and keeps going', async () => {
    const { result, events } = await run([
      { content: [{ type: 'tool_use', name: 'scamp_get_element_by_id', input: { id: 'zzzz' } }] },
      { content: [{ type: 'text', text: 'That element does not exist.' }] },
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'tool-end', name: 'scamp_get_element_by_id', ok: false })
    );
    const content = result.history[2]?.content;
    expect(Array.isArray(content) && content[0]?.type === 'tool_result' && content[0].is_error).toBe(true);
    expect(result.outcome).toBe('done');
  });

  it('keeps the earlier conversation and only appends to it', async () => {
    const earlier: BetaMessageParam[] = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: [{ type: 'text', text: 'Hello.' }] },
    ];
    const { result } = await run([{ content: [{ type: 'text', text: 'Again.' }] }], { history: earlier });
    expect(result.history.slice(0, 2)).toEqual(earlier);
    expect(result.history).toHaveLength(4);
  });

  it('stops on a refusal without running a tool cut off mid-call', async () => {
    const calls: string[] = [];
    const { result } = await run(
      [
        {
          content: [{ type: 'tool_use', name: 'scamp_get_element_tree', input: {} }],
          stop_reason: 'refusal',
        },
      ],
      { invoke: fakeInvoke(calls) }
    );
    expect(result.outcome).toBe('refusal');
    expect(calls).toEqual([]);
    // No tool_use is left without a result for the next message.
    expect(result.history.map((m) => m.role)).toEqual(['user']);
  });

  it('stops at max_tokens without running a truncated tool call', async () => {
    const calls: string[] = [];
    const { result } = await run(
      [{ content: [{ type: 'tool_use', name: 'scamp_get_element_tree', input: {} }], stop_reason: 'max_tokens' }],
      { invoke: fakeInvoke(calls) }
    );
    expect(result.outcome).toBe('max-tokens');
    expect(calls).toEqual([]);
    expect(result.history.map((m) => m.role)).toEqual(['user']);
  });

  it('keeps a text reply cut off at max_tokens', async () => {
    const { result } = await run([
      { content: [{ type: 'text', text: 'A long answ' }], stop_reason: 'max_tokens' },
    ]);
    expect(result.outcome).toBe('max-tokens');
    expect(result.history.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('stops after the step limit with a valid history', async () => {
    const loop: ScriptedTurn = { content: [{ type: 'tool_use', name: 'scamp_get_element_tree', input: {} }] };
    const { result } = await run([loop, loop, loop, loop], { maxSteps: 2 });
    expect(result.outcome).toBe('too-many-steps');
    // Ends on the tool results, so the next message can follow.
    expect(result.history.at(-1)?.role).toBe('user');
  });

  it('reports a rejected key and keeps the history valid', async () => {
    const authError = Anthropic.APIError.generate(
      401,
      { type: 'error', error: { type: 'authentication_error', message: 'bad key' } },
      'bad key',
      new Headers()
    );
    const { result } = await run([{ content: [], error: authError }]);
    expect(result.outcome).toBe('error');
    expect(result.keyRejected).toBe(true);
    expect(result.message).toContain('didn’t accept that key');
    expect(result.history.map((m) => m.role)).toEqual(['user']);
  });

  it('reports a rate limit in plain language', async () => {
    const rateLimit = Anthropic.APIError.generate(429, undefined, 'slow down', new Headers());
    const { result } = await run([{ content: [], error: rateLimit }]);
    expect(result.outcome).toBe('error');
    expect(result.keyRejected).toBeUndefined();
    expect(result.message).toContain('rate-limiting');
  });

  it('ends as cancelled when stopped before calling the provider', async () => {
    const controller = new AbortController();
    controller.abort();
    const { result } = await run([{ content: [{ type: 'text', text: 'never' }] }], {
      signal: controller.signal,
    });
    expect(result.outcome).toBe('cancelled');
  });
});

describe('createAgentSession', () => {
  const session = (script: ScriptedTurn[], events: AgentEvent[]) =>
    createAgentSession({
      getProvider: async () => createScriptedProvider(script),
      invoke: fakeInvoke(),
      system: 'test',
      tools: [],
      emit: (e) => events.push(e),
      onKeyRejected: () => {},
    });

  it('stamps every event with its turn and ends with usage', async () => {
    const events: AgentEvent[] = [];
    const agent = session([{ content: [{ type: 'text', text: 'Hi.' }] }], events);
    expect(await agent.send('Hello', 'Page: home', 'turn_1')).toEqual({ ok: true });
    await agent.idle();
    expect(events).toEqual([
      { kind: 'text', turnId: 'turn_1', text: 'Hi.' },
      {
        kind: 'turn-end',
        turnId: 'turn_1',
        outcome: 'done',
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    ]);
  });

  it('refuses a second message while one is in flight', async () => {
    const agent = session([{ content: [{ type: 'text', text: 'Hi.' }] }], []);
    const first = agent.send('One', '', 'turn_1');
    expect(await agent.send('Two', '', 'turn_1')).toMatchObject({ ok: false, reason: 'busy' });
    await first;
    await agent.idle();
  });

  it('says so when there is no provider to talk to', async () => {
    const agent = createAgentSession({
      getProvider: async () => null,
      invoke: fakeInvoke(),
      system: 'test',
      tools: [],
      emit: () => {},
      onKeyRejected: () => {},
    });
    expect(await agent.send('Hello', '', 'turn_1')).toMatchObject({ ok: false, reason: 'not-connected' });
  });

  it('carries the conversation across messages, and reset starts a new one', async () => {
    const agent = session(
      [{ content: [{ type: 'text', text: 'One.' }] }, { content: [{ type: 'text', text: 'Two.' }] }],
      []
    );
    await agent.send('First', '', 'turn_1');
    await agent.idle();
    await agent.send('Second', '', 'turn_1');
    await agent.idle();
    expect(agent.history()).toHaveLength(4);
    agent.reset();
    expect(agent.history()).toEqual([]);
  });

  it('still ends the turn, and frees the session, when a tool throws', async () => {
    const events: AgentEvent[] = [];
    const agent = createAgentSession({
      getProvider: async () =>
        createScriptedProvider([
          { content: [{ type: 'tool_use', name: 'scamp_get_element_tree', input: {} }] },
          { content: [{ type: 'text', text: 'Recovered.' }] },
        ]),
      invoke: async () => {
        throw new Error('renderer went away');
      },
      system: 'test',
      tools: [],
      emit: (e) => events.push(e),
      onKeyRejected: () => {},
    });
    await agent.send('Hello', '', 'turn_1');
    await agent.idle();
    expect(events.at(-1)).toMatchObject({ kind: 'turn-end', outcome: 'error' });
    // Not stuck busy.
    expect(await agent.send('Again', '', 'turn_1')).toMatchObject({ ok: true });
    await agent.idle();
  });

  it('tells the caller when the provider rejected the key', async () => {
    let rejected = false;
    const agent = createAgentSession({
      getProvider: async () =>
        createScriptedProvider([
          { content: [], error: Anthropic.APIError.generate(401, undefined, 'bad', new Headers()) },
        ]),
      invoke: fakeInvoke(),
      system: 'test',
      tools: [],
      emit: () => {},
      onKeyRejected: () => {
        rejected = true;
      },
    });
    await agent.send('Hello', '', 'turn_1');
    await agent.idle();
    expect(rejected).toBe(true);
  });
});

describe('noteNextTurn', () => {
  const sessionWith = (sent: string[]) =>
    createAgentSession({
      getProvider: async () => ({
        streamTurn: async (request) => {
          const last = request.messages.at(-1);
          sent.push(typeof last?.content === 'string' ? last.content : '');
          return createScriptedProvider([{ content: [{ type: 'text', text: 'ok' }] }]).streamTurn(request, {
            onText: () => {},
            onProgress: () => {},
          });
        },
      }),
      invoke: fakeInvoke(),
      system: 'test',
      tools: [],
      emit: () => {},
      onKeyRejected: () => {},
    });

  it('tells the agent once, in front of the next message', async () => {
    const sent: string[] = [];
    const agent = sessionWith(sent);
    agent.noteNextTurn('The user undid your changes.');
    await agent.send('What now?', 'Page: home', 't1');
    await agent.idle();
    await agent.send('And now?', 'Page: home', 't2');
    await agent.idle();
    expect(sent[0]).toBe('[Scamp: The user undid your changes.]\n[Scamp: Page: home]\n\nWhat now?');
    expect(sent[1]).toBe('[Scamp: Page: home]\n\nAnd now?');
  });

  it('is dropped by a new conversation', async () => {
    const sent: string[] = [];
    const agent = sessionWith(sent);
    agent.noteNextTurn('Stale.');
    agent.reset();
    await agent.send('Hi', '', 't1');
    await agent.idle();
    expect(sent[0]).toBe('Hi');
  });
});

describe('userContentFor', () => {
  it('puts the context line in front of the words', () => {
    expect(userContentFor('Center it', 'Page: home · Selected: rect_a1b2')).toBe(
      '[Scamp: Page: home · Selected: rect_a1b2]\n\nCenter it'
    );
  });

  it('sends the words alone when there is no context', () => {
    expect(userContentFor('Hello', '   ')).toBe('Hello');
  });
});

describe('agentToolsFrom', () => {
  const tools = agentToolsFrom(TOOL_DESCRIPTORS);

  it('offers the read tools, but not the scaffold that writes files', () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain('scamp_get_element_tree');
    expect(names).toContain('scamp_check_view');
    expect(names).not.toContain('scamp_get_component_scaffold');
  });

  it('lists them in a stable order, so the cached prefix never changes', () => {
    const names = tools.map((t) => t.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(agentToolsFrom([...TOOL_DESCRIPTORS].reverse())).toEqual(tools);
  });

  it('keeps each tool’s schema as an object schema', () => {
    for (const tool of tools) expect(tool.input_schema.type).toBe('object');
  });
});
