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
describe('the user’s own agent working the queue', () => {
    it('runs nothing itself, and hands a batch over once the batching pause has passed', async () => {
        const { agent, calls, phases } = setup(null);
        agent.setWorker('own');
        agent.enqueue(item('a', '20px'));
        agent.enqueue(item('b', '24px'));
        const batch = await agent.takeBatch(1000);
        expect(batch?.map((i) => i.id)).toEqual(['a', 'b']);
        expect(calls).toEqual([]);
        expect(agent.state().queued).toEqual([]);
        expect(agent.heldBatch()?.map((i) => i.id)).toEqual(['a', 'b']);
        expect(phases().at(-1)).toBe('writing');
    });
    it('finishes the batch with what changed, as a run of its own would', async () => {
        const { agent, events } = setup(null);
        agent.setWorker('own');
        agent.enqueue(item('a', '20px'));
        await agent.takeBatch(1000);
        expect(await agent.finishBatch('Set the padding in Card.module.css.', ['src/Card.module.css'])).toBe(true);
        expect(agent.touched()).toEqual(['src/Card.module.css']);
        expect(agent.heldBatch()).toBeNull();
        const last = events.filter((e) => e.kind === 'state').at(-1);
        expect(last?.kind === 'state' ? [last.state.phase, last.state.lastText, last.state.lastRunItemIds] : null).toEqual(['done', 'Set the padding in Card.module.css.', ['a']]);
    });
    it('says no batch is held when finishing twice, and takes one batch at a time', async () => {
        const { agent } = setup(null);
        agent.setWorker('own');
        agent.enqueue(item('a', '20px'));
        await agent.takeBatch(1000);
        agent.enqueue(item('b', '24px'));
        expect(await agent.takeBatch(50)).toBeNull();
        await agent.finishBatch('', []);
        expect(await agent.finishBatch('', [])).toBe(false);
        expect((await agent.takeBatch(1000))?.map((i) => i.id)).toEqual(['b']);
    });
    it('waits out the timeout with an empty queue', async () => {
        const { agent } = setup(null);
        agent.setWorker('own');
        const started = Date.now();
        expect(await agent.takeBatch(120)).toBeNull();
        expect(Date.now() - started).toBeGreaterThanOrEqual(100);
    });
    it('holds the queue while paused, until Run now lets one batch through', async () => {
        const { agent } = setup(null);
        agent.setWorker('own');
        agent.setPaused(true);
        agent.enqueue(item('a', '20px'));
        expect(await agent.takeBatch(80)).toBeNull();
        agent.runNow();
        expect((await agent.takeBatch(1000))?.map((i) => i.id)).toEqual(['a']);
    });
    it('puts a taken batch back at the front when stopped', async () => {
        const { agent } = setup(null);
        agent.setWorker('own');
        agent.enqueue(item('a', '20px'));
        await agent.takeBatch(1000);
        agent.enqueue(item('b', '24px'));
        agent.cancel();
        expect(agent.heldBatch()).toBeNull();
        expect(agent.state().queued.map((i) => i.id)).toEqual(['a', 'b']);
    });
    it('gives the user’s agent nothing while Scamp’s own agent works the queue', async () => {
        const { agent } = setup(null);
        agent.enqueue(item('a', '20px'));
        expect(await agent.takeBatch(60)).toBeNull();
    });
});
describe('runs, for undo and the commit message', () => {
    it('calls the run hooks around a run of the Scamp Agent, and names the run in its state', async () => {
        const calls = [];
        const events = [];
        const agent = createEmbeddedAgent({
            folder: '/p/app',
            idioms: ['css-modules'],
            getProvider: async () => createScriptedProvider([{ content: [{ type: 'text', text: 'Done.' }] }]),
            emit: (e) => events.push(e),
            batchDelayMs: 10,
            invoker: () => async () => ({ content: [{ type: 'text', text: 'ok' }] }),
            onRunStart: async (id) => {
                calls.push(`start ${id}`);
            },
            onRunEnd: async (id) => {
                calls.push(`end ${id}`);
            },
        });
        agent.enqueue(item('a', '20px'));
        await until(() => agent.state().phase === 'done');
        const runId = agent.state().lastRunId;
        expect(runId).toMatch(/^run-/);
        expect(calls).toEqual([`start ${runId}`, `end ${runId}`]);
    });
    it('calls the run hooks around the user’s agent’s batch too', async () => {
        const calls = [];
        const agent = createEmbeddedAgent({
            folder: '/p/app',
            idioms: [],
            getProvider: async () => null,
            emit: () => undefined,
            batchDelayMs: 10,
            onRunStart: async (id) => {
                calls.push(`start ${id}`);
            },
            onRunEnd: async (id) => {
                calls.push(`end ${id}`);
            },
        });
        agent.setWorker('own');
        agent.enqueue(item('a', '20px'));
        await agent.takeBatch(1000);
        await agent.finishBatch('Done.', []);
        expect(calls).toHaveLength(2);
        expect(calls[1]).toBe(`end ${agent.state().lastRunId}`);
    });
    it('keeps a summary of what was written until an accept or discard clears it', async () => {
        const { agent } = setup(null);
        agent.setWorker('own');
        agent.enqueue(item('a', '20px'));
        await agent.takeBatch(1000);
        await agent.finishBatch('', ['src/Card.module.css']);
        agent.enqueue(item('b', '24px'));
        await agent.takeBatch(1000);
        await agent.finishBatch('', ['src/Card.module.css']);
        expect(agent.doneSummary()).toEqual([
            { text: 'Changed spacing on Box', detail: '<div> padding → 20px' },
            { text: 'Changed spacing on Box', detail: '<div> padding → 24px' },
        ]);
        agent.clearTouched(['src/Card.module.css']);
        expect(agent.doneSummary()).toHaveLength(2);
        agent.clearTouched();
        expect(agent.doneSummary()).toEqual([]);
    });
    it('adds files back to the touched list, for a redo', () => {
        const { agent } = setup(null);
        agent.addTouched(['b.css', 'a.css']);
        expect(agent.touched()).toEqual(['a.css', 'b.css']);
    });
});
describe('createEmbeddedAgent: edits Scamp writes itself', () => {
    const direct = (provider) => {
        const events = [];
        const agent = createEmbeddedAgent({
            folder: '/p/app',
            idioms: ['css-modules'],
            getProvider: async () => provider,
            emit: (e) => events.push(e),
            batchDelayMs: 10,
            writeDirect: async (i) => (i.id.startsWith('direct') ? 'src/Card.module.css' : null),
        });
        return { agent, events };
    };
    it('writes a certain edit without the agent, even with none signed in', async () => {
        const { agent, events } = direct(null);
        agent.enqueue(item('direct-1', '24px'));
        await until(() => agent.state().phase === 'done');
        expect(agent.touched()).toEqual(['src/Card.module.css']);
        expect(agent.state().lastRunItemIds).toEqual(['direct-1']);
        expect(events.some((e) => e.kind === 'text' && e.text.startsWith('Scamp wrote this directly, in src/Card.module.css.'))).toBe(true);
    });
    it('sends only the rest to the agent', async () => {
        const { provider, prompts } = recording();
        const { agent } = direct(provider);
        agent.setPaused(true);
        agent.enqueue(item('direct-1', '24px'));
        agent.enqueue(item('other', '8px'));
        agent.setPaused(false);
        await until(() => agent.state().phase === 'done');
        expect(prompts).toHaveLength(1);
        expect(prompts[0]).toContain('this change');
        expect(prompts[0]).toContain('`8px`');
        expect(prompts[0]).not.toContain('`24px`');
    });
    it('says the rest needs the agent when none is signed in', async () => {
        const { agent } = direct(null);
        agent.setPaused(true);
        agent.enqueue(item('direct-1', '24px'));
        agent.enqueue(item('other', '8px'));
        agent.setPaused(false);
        await until(() => agent.state().phase === 'error');
        expect(agent.state().message).toContain('write the rest');
    });
});
