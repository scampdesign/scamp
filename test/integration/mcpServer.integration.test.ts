import { promises as fs } from 'fs';
import { request } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ensureToken,
  markMcpStopped,
  mcpConfigPath,
  readMcpConfig,
  writeMcpConfig,
} from '../../src/main/mcp/mcpOps';
import { textResult } from '../../src/main/mcp/protocol';
import { startMcpServer, type RunningMcpServer } from '../../src/main/mcp/server';
import { createToolInvoker, TOOL_DESCRIPTORS } from '../../src/main/mcp/tools';

/**
 * A fresh port per server start. A fixed one collided with whatever else
 * vitest was running in parallel, and the failure landed on a different
 * test each time.
 */
let nextPort = 41800;

/**
 * A real HTTP server on a real port, driven the way a real client drives it.
 *
 * The unit tests prove our reading of the spec; this is the level that
 * catches a transport-shape mistake — a wrong status code, a body that
 * shouldn't be there, a header check that rejects a legitimate client.
 * Header casing and the `Accept` value below match what Phase 0 observed
 * from Claude Code 2.1.222, not what the spec merely permits.
 * see docs/archive/2026-08-06-mcp-server-plan.md
 */

const TOKEN = 'test-token-1234';

describe('MCP HTTP server', () => {
  let server: RunningMcpServer;

  const post = async (
    body: unknown,
    init: { token?: string | null; origin?: string } = {}
  ): Promise<Response> => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      // Exactly as Phase 0 saw it — with the space.
      accept: 'application/json, text/event-stream',
    };
    const token = init.token === undefined ? TOKEN : init.token;
    if (token !== null) headers['x-scamp-token'] = token;
    if (init.origin !== undefined) headers['origin'] = init.origin;
    return fetch(server.url, {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  };

  beforeEach(async () => {
    server = await startMcpServer({
      token: TOKEN,
      // Well away from the real default so a running Scamp can't collide.
      port: (nextPort += 1),
      deps: {
        tools: TOOL_DESCRIPTORS,
        invoke: createToolInvoker(async (tool) => ({ tool, ok: true })),
      },
    });
  });

  afterEach(async () => {
    await server.close();
  });

  describe('the handshake', () => {
    it('completes initialize', async () => {
      const res = await post({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {} },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        result: { capabilities: { tools: {} }, serverInfo: { name: 'scamp' } },
      });
    });

    it('answers a newer protocol version with one we support', async () => {
      // Phase 0: real Claude Code asked for 2025-11-25 and accepted this.
      const res = await post({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-11-25' },
      });
      const body = await res.json();
      expect(body.result.protocolVersion).toBe('2025-06-18');
    });

    it('accepts the initialized notification with 202 and no body', async () => {
      const res = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
      expect(res.status).toBe(202);
      expect(await res.text()).toBe('');
    });

    it('accepts a request carrying the negotiated MCP-Protocol-Version header', async () => {
      // The client echoes the NEGOTIATED version, not the one it asked for.
      const res = await fetch(server.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-scamp-token': TOKEN,
          'mcp-protocol-version': '2025-06-18',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ping' }),
      });
      expect(res.status).toBe(200);
    });
  });

  describe('tools', () => {
    it('lists every tool with a schema', async () => {
      const res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      const body = await res.json();
      // Counted from the descriptors rather than pinned: the number is
      // not the contract, "every one of them is advertised" is.
      expect(body.result.tools).toHaveLength(TOOL_DESCRIPTORS.length);
      expect(body.result.tools[0]).toHaveProperty('inputSchema');
    });

    it('calls a tool and returns text content', async () => {
      const res = await post({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'scamp_get_selected_element', arguments: {} },
      });
      const body = await res.json();
      expect(body.result.content[0].type).toBe('text');
      expect(body.result.content[0].text).toContain('scamp_get_selected_element');
      expect(body.result.isError).toBeUndefined();
    });

    it('decodes a body whose character is split across two writes', async () => {
      // Each chunk used to be decoded on its own, so a character cut in
      // half arrived as U+FFFD.
      const body = Buffer.from(
        JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'scamp_café', arguments: {} } })
      );
      const cut = body.indexOf(Buffer.from('é')) + 1;
      const text = await new Promise<string>((resolve, reject) => {
        const req = request(
          server.url,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-scamp-token': TOKEN, 'content-length': body.length },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
          }
        );
        req.on('error', reject);
        req.write(body.subarray(0, cut));
        setTimeout(() => req.end(body.subarray(cut)), 50);
      });
      expect(text).toContain('scamp_café');
      expect(text).not.toContain('\uFFFD');
    });

    it('reports an unknown tool as isError with HTTP 200', async () => {
      // A protocol-level failure here would tell the model nothing useful.
      const res = await post({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'scamp_nope', arguments: {} },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeUndefined();
      expect(body.result.isError).toBe(true);
    });

    it('surfaces a failing query as isError rather than a dead socket', async () => {
      const failing = await startMcpServer({
        token: TOKEN,
        port: 41850,
        deps: {
          tools: TOOL_DESCRIPTORS,
          invoke: createToolInvoker(async () => {
            throw new Error('canvas did not respond');
          }),
        },
      });
      try {
        const res = await fetch(failing.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-scamp-token': TOKEN },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 5,
            method: 'tools/call',
            params: { name: 'scamp_get_selected_element', arguments: {} },
          }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.result.isError).toBe(true);
        expect(body.result.content[0].text).toContain('canvas did not respond');
      } finally {
        await failing.close();
      }
    });
  });

  describe('protocol faults', () => {
    it('returns -32601 for an unknown method', async () => {
      const res = await post({ jsonrpc: '2.0', id: 6, method: 'resources/list' });
      const body = await res.json();
      expect(body.error.code).toBe(-32601);
    });

    it('returns -32700 for malformed JSON', async () => {
      const res = await post('{not json');
      const body = await res.json();
      expect(body.error.code).toBe(-32700);
    });
  });

  describe('transport rules', () => {
    it('refuses GET with 405, since we offer no server stream', async () => {
      // Phase 0 watched real Claude Code issue this and carry on.
      const res = await fetch(server.url, {
        headers: { 'x-scamp-token': TOKEN, accept: 'text/event-stream' },
      });
      expect(res.status).toBe(405);
    });

    it('refuses DELETE with 405', async () => {
      const res = await fetch(server.url, {
        method: 'DELETE',
        headers: { 'x-scamp-token': TOKEN },
      });
      expect(res.status).toBe(405);
    });

    it('never caches an answer about live state', async () => {
      const res = await post({ jsonrpc: '2.0', id: 7, method: 'ping' });
      expect(res.headers.get('cache-control')).toBe('no-store');
    });
  });

  describe('access control', () => {
    it('rejects a request carrying a browser Origin', async () => {
      // Any page the user has open can fetch a localhost port.
      const res = await post({ jsonrpc: '2.0', id: 8, method: 'ping' }, {
        origin: 'https://evil.example',
      });
      expect(res.status).toBe(403);
    });

    it('rejects a missing token', async () => {
      const res = await post({ jsonrpc: '2.0', id: 8, method: 'ping' }, { token: null });
      expect(res.status).toBe(401);
    });

    it('rejects a wrong token', async () => {
      const res = await post({ jsonrpc: '2.0', id: 8, method: 'ping' }, {
        token: 'not-the-token',
      });
      expect(res.status).toBe(401);
    });

    it('checks Origin before the token, so a browser learns nothing', async () => {
      const res = await post({ jsonrpc: '2.0', id: 8, method: 'ping' }, {
        origin: 'https://evil.example',
        token: null,
      });
      expect(res.status).toBe(403);
    });
  });

  describe('port allocation', () => {
    it('scans past a taken port and reports where it landed', async () => {
      // Ask for the port the running server actually took, so the
      // collision is guaranteed. Naming a constant here stopped working
      // once each server start took a fresh port: the constant was free,
      // the scan had nothing to scan past, and it landed exactly on it.
      const taken = server.port;
      const second = await startMcpServer({
        token: TOKEN,
        port: taken,
        deps: { tools: [], invoke: async () => textResult('x') },
      });
      try {
        // Asserting exactly +1 was flaky: a socket left in TIME_WAIT by a
        // previous run pushes the scan one further. The guarantee is "moves
        // past what's taken and reports where it landed", not "+1".
        expect(second.port).toBeGreaterThan(taken);
        expect(second.port).toBeLessThanOrEqual(taken + 10);
        expect(second.url).toContain(String(second.port));
      } finally {
        await second.close();
      }
    });

    it('binds loopback only', async () => {
      expect(server.url.startsWith('http://127.0.0.1:')).toBe(true);
    });

    it('stops answering once closed', async () => {
      const temp = await startMcpServer({
        token: TOKEN,
        port: 41900,
        deps: { tools: [], invoke: async () => textResult('x') },
      });
      const url = temp.url;
      await temp.close();
      await expect(
        fetch(url, {
          method: 'POST',
          headers: { 'x-scamp-token': TOKEN },
          body: '{"jsonrpc":"2.0","id":1,"method":"ping"}',
        })
      ).rejects.toThrow();
    });
  });
});

describe('mcp.json', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'scamp-mcp-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('writes into .scamp/, which the watcher ignores', async () => {
    expect(mcpConfigPath(dir)).toBe(join(dir, '.scamp', 'mcp.json'));
  });

  it('creates .scamp/ when absent', async () => {
    await writeMcpConfig(dir, {
      url: 'http://127.0.0.1:39841/mcp',
      token: 'abc',
      running: true,
      started_at: '2026-08-05T10:00:00Z',
      project: 'demo',
    });
    expect(await readMcpConfig(dir)).toMatchObject({ token: 'abc', running: true });
  });

  it('reuses an existing token across launches', async () => {
    // The token lives in the agent's config file, which is not re-read at
    // runtime — regenerating it would break every registration on restart.
    await writeMcpConfig(dir, {
      url: 'http://127.0.0.1:39841/mcp',
      token: 'stable-token',
      running: false,
      started_at: '',
      project: 'demo',
    });
    expect(await ensureToken(dir)).toBe('stable-token');
  });

  it('generates a token when there is no config yet', async () => {
    const token = await ensureToken(dir);
    expect(token).toMatch(/^[0-9a-f]{48}$/);
  });

  it('generates a fresh token when the config is corrupt', async () => {
    await fs.mkdir(join(dir, '.scamp'), { recursive: true });
    await fs.writeFile(mcpConfigPath(dir), 'not json at all', 'utf-8');
    expect(await ensureToken(dir)).toMatch(/^[0-9a-f]{48}$/);
  });

  it('marks the server stopped without dropping the token', async () => {
    await writeMcpConfig(dir, {
      url: 'http://127.0.0.1:39841/mcp',
      token: 'keep-me',
      running: true,
      started_at: '2026-08-05T10:00:00Z',
      project: 'demo',
    });
    await markMcpStopped(dir);
    const after = await readMcpConfig(dir);
    expect(after).toMatchObject({ running: false, token: 'keep-me' });
  });

  it('does nothing when asked to stop a project that never started', async () => {
    await expect(markMcpStopped(dir)).resolves.toBeUndefined();
    expect(await readMcpConfig(dir)).toBeNull();
  });

  it('returns null rather than throwing for a missing project folder', async () => {
    expect(await readMcpConfig(join(dir, 'nope'))).toBeNull();
  });
});

describe('onAuthenticatedRequest', () => {
  it('fires only for requests that passed the token check', async () => {
    let seen = 0;
    const server = await startMcpServer({
      token: TOKEN,
      port: (nextPort += 1),
      onAuthenticatedRequest: () => {
        seen += 1;
      },
      deps: {
        tools: TOOL_DESCRIPTORS,
        invoke: createToolInvoker(async () => ({ ok: true })),
      },
    });
    try {
      const ping = { jsonrpc: '2.0', id: 1, method: 'ping' };
      const headers = { 'content-type': 'application/json' };

      await fetch(server.url, { method: 'POST', headers, body: JSON.stringify(ping) });
      expect(seen).toBe(0); // no token — an agent has NOT connected

      await fetch(server.url, {
        method: 'POST',
        headers: { ...headers, 'x-scamp-token': 'wrong' },
        body: JSON.stringify(ping),
      });
      expect(seen).toBe(0);

      await fetch(server.url, {
        method: 'POST',
        headers: { ...headers, 'x-scamp-token': TOKEN },
        body: JSON.stringify(ping),
      });
      expect(seen).toBe(1);
    } finally {
      await server.close();
    }
  });
});
