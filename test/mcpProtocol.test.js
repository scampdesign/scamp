import { describe, expect, it, vi } from 'vitest';
import { RPC } from '../src/main/mcp/jsonRpc';
import { dispatch, errorResult, handlePayload, LATEST_PROTOCOL_VERSION, negotiateVersion, SERVER_INFO, SERVER_INSTRUCTIONS, SUPPORTED_PROTOCOL_VERSIONS, textResult, } from '../src/main/mcp/protocol';
/**
 * MCP semantics. Several cases here exist because Phase 0 watched a real
 * Claude Code client do the thing — they are regression tests for observed
 * behaviour, not guesses at the spec.
 * see docs/archive/2026-08-06-mcp-server-plan.md
 */
const TOOLS = [
    {
        name: 'scamp_get_selected_element',
        description: 'Details of the selected element.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'scamp_get_element_by_id',
        description: 'Details of any element by id.',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
            additionalProperties: false,
        },
    },
];
const deps = (over = {}) => ({
    tools: TOOLS,
    invoke: async () => textResult('ok'),
    ...over,
});
const req = (method, params, id = 1) => ({
    jsonrpc: '2.0',
    id,
    method,
    ...(params === undefined ? {} : { params }),
});
describe('initialize', () => {
    it('returns capabilities, server info, and a protocol version', async () => {
        const out = await dispatch(req('initialize', { protocolVersion: '2025-06-18' }), deps());
        expect(out).toMatchObject({
            jsonrpc: '2.0',
            id: 1,
            result: {
                protocolVersion: '2025-06-18',
                capabilities: { tools: {} },
                serverInfo: SERVER_INFO,
            },
        });
    });
    it('sends instructions that reach an agent which never read agent.md', async () => {
        // The one fact that got missed in practice: reusable UI is a folder
        // under components/, not a page. Clients surface this string to the
        // model on connect, so it works even when agent.md was skipped.
        const out = await dispatch(req('initialize'), deps());
        expect(out).toMatchObject({ result: { instructions: SERVER_INSTRUCTIONS } });
        expect(SERVER_INSTRUCTIONS).toContain('components/<Name>/<Name>.tsx');
        expect(SERVER_INSTRUCTIONS).toContain('scamp_get_component_scaffold');
        expect(SERVER_INSTRUCTIONS).toContain('agent.md');
        // Verifying work means asking Scamp what it actually parsed, not
        // running a build. see docs/notes/view-lint.md
        expect(SERVER_INSTRUCTIONS).toMatch(/Do not run a build/);
        expect(SERVER_INSTRUCTIONS).toContain('scamp_check_view');
    });
    it('identifies the server as scamp so a misdirected client can tell', async () => {
        // The fixed port can in principle be taken by something else; serverInfo
        // is how a client discovers it reached the wrong process.
        const out = await dispatch(req('initialize'), deps());
        expect(out).toMatchObject({ result: { serverInfo: { name: 'scamp' } } });
    });
    it('answers with our latest when the client asks for a newer revision', async () => {
        // Observed in Phase 0: real Claude Code 2.1.222 asked for 2025-11-25,
        // accepted 2025-06-18, and connected. This is what keeps a stale
        // version list from becoming a broken server.
        const out = await dispatch(req('initialize', { protocolVersion: '2025-11-25' }), deps());
        expect(out).toMatchObject({
            result: { protocolVersion: LATEST_PROTOCOL_VERSION },
        });
    });
    it('echoes an older revision we still support', async () => {
        const out = await dispatch(req('initialize', { protocolVersion: '2024-11-05' }), deps());
        expect(out).toMatchObject({ result: { protocolVersion: '2024-11-05' } });
    });
    it('survives initialize with no params at all', async () => {
        const out = await dispatch(req('initialize'), deps());
        expect(out).toMatchObject({
            result: { protocolVersion: LATEST_PROTOCOL_VERSION },
        });
    });
});
describe('negotiateVersion', () => {
    it('accepts every version we claim to support', () => {
        for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
            expect(negotiateVersion(version)).toBe(version);
        }
    });
    it('falls back for junk input rather than throwing', () => {
        for (const junk of [undefined, null, 42, {}, '', 'not-a-date']) {
            expect(negotiateVersion(junk)).toBe(LATEST_PROTOCOL_VERSION);
        }
    });
});
describe('notifications', () => {
    it('answers notifications/initialized with nothing', async () => {
        const out = await dispatch({ jsonrpc: '2.0', method: 'notifications/initialized' }, deps());
        expect(out).toBeNull();
    });
    it('stays silent for an unknown notification', async () => {
        // There is no id to answer to, so an error response would be malformed.
        expect(await dispatch({ jsonrpc: '2.0', method: 'notifications/whatever' }, deps())).toBeNull();
    });
});
describe('tools/list', () => {
    it('returns every tool with its schema', async () => {
        const out = await dispatch(req('tools/list'), deps());
        expect(out).toMatchObject({ result: { tools: TOOLS } });
    });
    it('gives every tool a name, a description, and an object schema', async () => {
        // A tool added without these is invisible or unusable to the model —
        // this fails when someone adds one carelessly.
        const out = await dispatch(req('tools/list'), deps());
        const tools = out.result.tools;
        for (const tool of tools) {
            expect(tool.name).toMatch(/^scamp_[a-z_]+$/);
            expect(tool.description.length).toBeGreaterThan(0);
            expect(tool.inputSchema['type']).toBe('object');
        }
    });
});
describe('tools/call', () => {
    it('invokes the named tool and returns its content', async () => {
        const invoke = vi.fn(async () => textResult('the answer'));
        const out = await dispatch(req('tools/call', { name: 'scamp_get_selected_element', arguments: {} }), deps({ invoke }));
        expect(invoke).toHaveBeenCalledWith('scamp_get_selected_element', {});
        expect(out).toMatchObject({
            result: { content: [{ type: 'text', text: 'the answer' }] },
        });
    });
    it('passes arguments through', async () => {
        const invoke = vi.fn(async () => textResult('ok'));
        await dispatch(req('tools/call', { name: 'scamp_get_element_by_id', arguments: { id: 'a1b2' } }), deps({ invoke }));
        expect(invoke).toHaveBeenCalledWith('scamp_get_element_by_id', { id: 'a1b2' });
    });
    it('treats a missing arguments object as empty', async () => {
        const invoke = vi.fn(async () => textResult('ok'));
        await dispatch(req('tools/call', { name: 'scamp_get_selected_element' }), deps({ invoke }));
        expect(invoke).toHaveBeenCalledWith('scamp_get_selected_element', {});
    });
    it('reports an unknown tool as isError, NOT as a JSON-RPC error', async () => {
        // The distinction hand-rolled servers most often get wrong. A -32601
        // here tells the model nothing it can act on.
        const out = await dispatch(req('tools/call', { name: 'scamp_nonexistent', arguments: {} }), deps());
        expect(out).not.toHaveProperty('error');
        expect(out).toMatchObject({ result: { isError: true } });
    });
    it('names the available tools when one is unknown', async () => {
        const out = await dispatch(req('tools/call', { name: 'nope', arguments: {} }), deps());
        const text = out.result
            .content[0].text;
        expect(text).toContain('scamp_get_selected_element');
    });
    it('reports a missing tool name as isError', async () => {
        const out = await dispatch(req('tools/call', {}), deps());
        expect(out).toMatchObject({ result: { isError: true } });
    });
    it('converts a thrown handler into an isError result', async () => {
        // A bug on our side must still leave the agent with a usable turn.
        const invoke = vi.fn(async () => {
            throw new Error('renderer did not respond');
        });
        const out = await dispatch(req('tools/call', { name: 'scamp_get_selected_element', arguments: {} }), deps({ invoke }));
        expect(out).not.toHaveProperty('error');
        const text = out.result
            .content[0].text;
        expect(text).toContain('renderer did not respond');
    });
    it('passes an isError result from the tool straight through', async () => {
        const out = await dispatch(req('tools/call', { name: 'scamp_get_selected_element', arguments: {} }), deps({ invoke: async () => errorResult('no project open') }));
        expect(out).toMatchObject({
            result: { isError: true, content: [{ text: 'no project open' }] },
        });
    });
});
describe('unknown methods', () => {
    it('returns -32601 for a method we do not implement', async () => {
        const out = await dispatch(req('resources/list'), deps());
        expect(out).toMatchObject({
            error: { code: RPC.MethodNotFound },
        });
    });
    it('names the method so the client can log something useful', async () => {
        const out = await dispatch(req('prompts/get'), deps());
        expect(out.error.message).toContain('prompts/get');
    });
    it('answers with the same id it was asked with', async () => {
        const out = await dispatch(req('nope', undefined, 'xyz'), deps());
        expect(out).toMatchObject({ id: 'xyz' });
    });
});
describe('handlePayload', () => {
    it('dispatches a single request', async () => {
        const out = await handlePayload('{"jsonrpc":"2.0","id":1,"method":"ping"}', deps());
        expect(out.response).toMatchObject({ id: 1, result: {} });
    });
    it('returns null for a lone notification, so the caller can send 202', async () => {
        const out = await handlePayload('{"jsonrpc":"2.0","method":"notifications/initialized"}', deps());
        expect(out.response).toBeNull();
    });
    it('returns a parse error for malformed JSON', async () => {
        const out = await handlePayload('{oops', deps());
        expect(out.response).toMatchObject({ error: { code: RPC.ParseError } });
    });
    it('answers only the requests in a mixed batch', async () => {
        const out = await handlePayload('[{"jsonrpc":"2.0","id":1,"method":"ping"},{"jsonrpc":"2.0","method":"notifications/initialized"}]', deps());
        expect(Array.isArray(out.response)).toBe(true);
        expect(out.response).toHaveLength(1);
    });
    it('returns null for a batch of only notifications', async () => {
        const out = await handlePayload('[{"jsonrpc":"2.0","method":"a"},{"jsonrpc":"2.0","method":"b"}]', deps());
        expect(out.response).toBeNull();
    });
});
describe('the full handshake, in order', () => {
    it('completes initialize → initialized → tools/list → tools/call', async () => {
        // The exact sequence Phase 0 observed from real Claude Code.
        const d = deps({ invoke: async () => textResult('SCAMP_OK') });
        const init = await handlePayload(JSON.stringify(req('initialize', { protocolVersion: '2025-11-25' })), d);
        expect(init.response).toMatchObject({ result: { capabilities: { tools: {} } } });
        const ack = await handlePayload('{"jsonrpc":"2.0","method":"notifications/initialized"}', d);
        expect(ack.response).toBeNull();
        const list = await handlePayload(JSON.stringify(req('tools/list', undefined, 2)), d);
        expect(list.response.result.tools).toHaveLength(2);
        const call = await handlePayload(JSON.stringify(req('tools/call', { name: 'scamp_get_selected_element', arguments: {} }, 3)), d);
        expect(call.response).toMatchObject({
            id: 3,
            result: { content: [{ text: 'SCAMP_OK' }] },
        });
    });
});
