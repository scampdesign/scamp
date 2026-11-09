import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startMcpServer } from '../../src/main/mcp/server';
import { createEmbeddedAgent } from '../../src/main/embedded/agentQueue';
import { changedBetween, changedFiles, OWN_AGENT_TOOLS, ownAgentInvoker } from '../../src/main/embedded/ownAgent';
/**
 * The user's own agent working Embedded Scamp's queue, driven over a real
 * MCP server the way Claude Code drives it, against a real git repository:
 * take a batch, write files, say done, and Scamp attributes exactly the
 * files written in between, not the user's own uncommitted changes.
 */
const TOKEN = 'own-agent-token';
let nextPort = 41950;
const item = {
    id: 'a',
    kind: 'style',
    scope: 'all',
    element: { source: 'src/Card.jsx:4:5', library: null, page: '/', selector: 'main > article', tag: 'article', classes: ['card'], components: ['Card'], instanceCount: 3, usedAt: null, text: 'Ada' },
    changes: [{ property: 'padding', from: '16px', to: '24px' }],
};
const gitIn = (cwd, ...args) => {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
};
describe('the user’s own agent over MCP', () => {
    let repo;
    let folder;
    let server;
    let agent;
    let seen = 0;
    const call = async (name, args = {}) => {
        const res = await fetch(server.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'x-scamp-token': TOKEN },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
        });
        const body = (await res.json());
        return { text: body.result.content.map((c) => c.text).join(''), isError: body.result.isError === true };
    };
    beforeEach(async () => {
        repo = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-own-agent-')));
        // The project is a folder inside the repository, as in a monorepo.
        folder = path.join(repo, 'web');
        await fs.mkdir(path.join(folder, 'src'), { recursive: true });
        await fs.writeFile(path.join(folder, 'src', 'Card.module.css'), '.card { padding: 16px; }\n');
        await fs.writeFile(path.join(folder, 'src', 'App.jsx'), 'export const App = () => null;\n');
        await fs.writeFile(path.join(repo, 'README.md'), 'repo\n');
        gitIn(repo, 'init', '-q');
        gitIn(repo, '-c', 'user.name=T', '-c', 'user.email=t@t', 'add', '.');
        gitIn(repo, '-c', 'user.name=T', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');
        agent = createEmbeddedAgent({ folder, idioms: ['css-modules'], getProvider: async () => null, emit: () => undefined, batchDelayMs: 10 });
        agent.setWorker('own');
        seen = 0;
        server = await startMcpServer({
            token: TOKEN,
            port: (nextPort += 1),
            deps: {
                tools: OWN_AGENT_TOOLS,
                invoke: ownAgentInvoker({
                    folder,
                    idioms: () => ['css-modules'],
                    agent: () => agent,
                    selection: () => null,
                    onSeen: () => {
                        seen += 1;
                    },
                }),
            },
        });
    });
    afterEach(async () => {
        agent.dispose();
        await server.close();
        await fs.rm(repo, { recursive: true, force: true });
    });
    it('lists the three tools', async () => {
        const res = await fetch(server.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'x-scamp-token': TOKEN },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        });
        const body = (await res.json());
        expect(body.result.tools.map((t) => t.name)).toEqual(['scamp_embedded_wait_for_edits', 'scamp_embedded_done', 'scamp_embedded_get_selection']);
    });
    it('hands over a batch with Scamp’s rules, and attributes only the files written after it', async () => {
        // The user's own change, before the agent takes anything: never the agent's.
        await fs.writeFile(path.join(folder, 'src', 'App.jsx'), 'export const App = () => <main />;\n');
        agent.enqueue(item);
        const taken = await call('scamp_embedded_wait_for_edits', { waitSeconds: 5 });
        expect(taken.isError).toBe(false);
        expect(taken.text).toContain('call scamp_embedded_done');
        expect(taken.text).toContain('don’t run git commands');
        expect(taken.text).toContain('### Edit 1: style');
        expect(taken.text).toContain('`padding`: `16px` → `24px`');
        // The agent writes, with its own tools: one edit, one new file, and one outside the project.
        await fs.writeFile(path.join(folder, 'src', 'Card.module.css'), '.card { padding: 24px; }\n');
        await fs.writeFile(path.join(folder, 'src', 'tokens.css'), ':root { --space: 24px; }\n');
        await fs.writeFile(path.join(repo, 'README.md'), 'repo, edited\n');
        const done = await call('scamp_embedded_done', { summary: 'Set the card padding to 24px.' });
        expect(done.text).toBe('Done. Scamp sees changes in: src/Card.module.css, src/tokens.css.');
        expect(agent.touched()).toEqual(['src/Card.module.css', 'src/tokens.css']);
        expect(agent.state().phase).toBe('done');
        expect(seen).toBe(2);
    });
    it('answers an empty wait, a done with no batch, and a second wait while one is held', async () => {
        expect((await call('scamp_embedded_wait_for_edits', { waitSeconds: 0 })).text).toContain('No edits yet');
        expect((await call('scamp_embedded_done', { summary: '' })).isError).toBe(true);
        agent.enqueue(item);
        await call('scamp_embedded_wait_for_edits', { waitSeconds: 5 });
        const again = await call('scamp_embedded_wait_for_edits', { waitSeconds: 0 });
        expect(again.isError).toBe(true);
        expect(again.text).toContain('You already have a batch');
    });
    it('turns the user’s agent away while Scamp’s own agent has the queue', async () => {
        agent.setWorker('scamp');
        const res = await call('scamp_embedded_wait_for_edits', { waitSeconds: 0 });
        expect(res.isError).toBe(true);
        expect(res.text).toContain('choose My agent');
    });
    it('reports the selection, or that there is none', async () => {
        expect((await call('scamp_embedded_get_selection')).text).toBe('Nothing is selected.');
    });
});
describe('changedFiles and changedBetween', () => {
    it('sees edits, new files, and deletions relative to the project folder', async () => {
        const repo = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-changed-')));
        try {
            await fs.writeFile(path.join(repo, 'a.css'), 'a\n');
            await fs.writeFile(path.join(repo, 'b.css'), 'b\n');
            gitIn(repo, 'init', '-q');
            gitIn(repo, '-c', 'user.name=T', '-c', 'user.email=t@t', 'add', '.');
            gitIn(repo, '-c', 'user.name=T', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');
            await fs.writeFile(path.join(repo, 'a.css'), 'a, mine\n');
            const before = await changedFiles(repo);
            await fs.writeFile(path.join(repo, 'a.css'), 'a, mine, then the agent’s\n');
            await fs.rm(path.join(repo, 'b.css'));
            await fs.writeFile(path.join(repo, 'c.css'), 'c\n');
            expect(changedBetween(before, await changedFiles(repo))).toEqual(['a.css', 'b.css', 'c.css']);
        }
        finally {
            await fs.rm(repo, { recursive: true, force: true });
        }
    });
});
