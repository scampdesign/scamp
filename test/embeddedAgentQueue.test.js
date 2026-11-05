import { describe, expect, it } from 'vitest';
import { createScriptedProvider } from '../src/main/agent/scriptedProvider';
import { createEmbeddedAgent } from '../src/main/embedded/agentQueue';
/**
 * Embedded Scamp's agent queue, with a scripted provider and a stub tool:
 * continuous runs, pause and batch, status, and the read-only design check.
 */
const item = (id, to) => ({
    id,
    kind: 'style',
    scope: 'instance',
    element: { source: 'src/Card.tsx:3:5', library: null, page: '/', selector: 'main > div', tag: 'div', classes: ['card'], components: ['Card'], instanceCount: 1, usedAt: null, text: '' },
    changes: [{ property: 'padding', from: '16px', to }],
});
const until = async (check, ms = 2000) => {
    const deadline = Date.now() + ms;
    while (!check()) {
        if (Date.now() > deadline)
            throw new Error('timed out');
        await new Promise((r) => setTimeout(r, 5));
    }
};
const setup = (provider, readOnlySeen = []) => {
    const events = [];
    const calls = [];
    const agent = createEmbeddedAgent({
        folder: '/p/app',
        idioms: ['css-modules'],
        getProvider: async () => provider,
        emit: (e) => events.push(e),
        batchDelayMs: 10,
        invoker: (touched, readOnly) => async (name, args) => {
            readOnlySeen.push(readOnly);
            calls.push(name);
            if (name === 'edit_file')
                touched.add(String(args['path']));
            return { content: [{ type: 'text', text: 'ok' }], summary: `Edited ${String(args['path'])}` };
        },
    });
    const phases = () => events.filter((e) => e.kind === 'state').map((e) => (e.kind === 'state' ? e.state.phase : ''));
    return { agent, events, calls, phases };
};
/** A provider that records each request's last user message. */
const recording = () => {
    const prompts = [];
    const scripted = createScriptedProvider([{ content: [{ type: 'text', text: 'Done.' }] }, { content: [{ type: 'text', text: 'Done again.' }] }]);
    return {
        prompts,
        provider: {
            streamTurn: async (request, callbacks) => {
                const users = request.messages.filter((m) => m.role === 'user' && typeof m.content === 'string');
                prompts.push(String(users[users.length - 1]?.content ?? ''));
                return scripted.streamTurn(request, callbacks);
            },
        },
    };
};
describe('createEmbeddedAgent', () => {
    it('runs a queued edit on its own, writing through the tools, and reports thinking → writing → done', async () => {
        const provider = createScriptedProvider([
            { content: [{ type: 'tool_use', name: 'edit_file', input: { path: 'src/Card.module.css', old_string: 'a', new_string: 'b' } }] },
            { content: [{ type: 'text', text: 'Set the card’s padding to 24px in Card.module.css.' }] },
        ]);
        const { agent, calls, phases, events } = setup(provider);
        agent.enqueue(item('a', '24px'));
        await until(() => agent.state().phase === 'done');
        expect(calls).toEqual(['edit_file']);
        expect(agent.touched()).toEqual(['src/Card.module.css']);
        expect(phases()).toEqual(['idle', 'thinking', 'writing', 'thinking', 'done']);
        expect(agent.state().lastRunItemIds).toEqual(['a']);
        expect(agent.state().lastText).toBe('Set the card’s padding to 24px in Card.module.css.');
        expect(events.some((e) => e.kind === 'tool' && e.summary === 'Edited src/Card.module.css')).toBe(true);
    });
    it('holds the queue while paused, then sends it all as one batch', async () => {
        const { provider, prompts } = recording();
        const { agent } = setup(provider);
        agent.setPaused(true);
        agent.enqueue(item('a', '20px'));
        agent.enqueue(item('b', '24px'));
        await new Promise((r) => setTimeout(r, 40));
        expect(prompts).toEqual([]);
        expect(agent.state().queued.map((q) => q.id)).toEqual(['a', 'b']);
        agent.runNow();
        await until(() => agent.state().phase === 'done');
        expect(prompts).toHaveLength(1);
        expect(prompts[0]).toContain('### Edit 1');
        expect(prompts[0]).toContain('### Edit 2');
        expect(agent.state().queued).toEqual([]);
    });
    it('replaces an edit still in the queue rather than adding it twice', () => {
        const { agent } = setup(null);
        agent.setPaused(true);
        agent.enqueue(item('a', '20px'));
        agent.enqueue(item('a', '28px'));
        const queued = agent.state().queued;
        expect(queued).toHaveLength(1);
        expect(queued[0]?.kind === 'style' ? queued[0].changes[0]?.to : null).toBe('28px');
        agent.remove('a');
        expect(agent.state().queued).toEqual([]);
    });
    it('carries the conversation from one run to the next', async () => {
        const { provider, prompts } = recording();
        const { agent } = setup(provider);
        agent.enqueue(item('a', '20px'));
        await until(() => agent.state().phase === 'done');
        agent.enqueue(item('b', '24px'));
        await until(() => prompts.length === 2 && agent.state().phase === 'done');
        expect(prompts[1]).toContain('`24px`');
    });
    it('says so when there is no provider, instead of running', async () => {
        const { agent } = setup(null);
        agent.enqueue(item('a', '20px'));
        await until(() => agent.state().phase === 'error');
        expect(agent.state().message).toMatch(/Sign in/);
    });
    it('runs the design check read-only, and reports what it found', async () => {
        const readOnly = [];
        const provider = createScriptedProvider([
            { content: [{ type: 'tool_use', name: 'read_file', input: { path: 'src/App.css' } }] },
            { content: [{ type: 'text', text: '## Tokens and consistency\n- src/App.css:3 uses #333.' }] },
        ]);
        const { agent, events } = setup(provider, readOnly);
        await agent.designCheck();
        expect(readOnly).toEqual([true]);
        expect(events.find((e) => e.kind === 'report')).toEqual({ kind: 'report', markdown: '## Tokens and consistency\n- src/App.css:3 uses #333.' });
    });
});
