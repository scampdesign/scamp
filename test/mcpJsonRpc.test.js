import { describe, expect, it } from 'vitest';
import { failure, isNotification, parsePayload, RPC, success, } from '../src/main/mcp/jsonRpc';
/**
 * The JSON-RPC envelope. Malformed input arrives here from a process we
 * don't control, so the unhappy paths are the point.
 * see docs/plans/mcp-server-plan.md
 */
describe('parsePayload — single messages', () => {
    it('parses a request with an id', () => {
        const out = parsePayload('{"jsonrpc":"2.0","id":1,"method":"ping"}');
        expect(out).toEqual({
            kind: 'single',
            message: { jsonrpc: '2.0', id: 1, method: 'ping', params: undefined },
        });
    });
    it('parses a notification, which carries no id', () => {
        const out = parsePayload('{"jsonrpc":"2.0","method":"notifications/initialized"}');
        expect(out.kind).toBe('single');
        if (out.kind !== 'single')
            throw new Error('expected single');
        expect(isNotification(out.message)).toBe(true);
    });
    it('keeps params intact', () => {
        const out = parsePayload('{"jsonrpc":"2.0","id":"a","method":"tools/call","params":{"name":"x"}}');
        if (out.kind !== 'single')
            throw new Error('expected single');
        expect(out.message.params).toEqual({ name: 'x' });
    });
    it('accepts a string id', () => {
        const out = parsePayload('{"jsonrpc":"2.0","id":"abc","method":"ping"}');
        if (out.kind !== 'single')
            throw new Error('expected single');
        expect(out.message.id).toBe('abc');
    });
});
describe('parsePayload — malformed input', () => {
    it('reports a parse error for invalid JSON', () => {
        const out = parsePayload('{not json');
        expect(out).toEqual({
            kind: 'error',
            response: failure(null, RPC.ParseError, 'Parse error'),
        });
    });
    it('reports a parse error for an empty body', () => {
        expect(parsePayload('')).toMatchObject({ kind: 'error' });
    });
    it('rejects a message with no method', () => {
        const out = parsePayload('{"jsonrpc":"2.0","id":1}');
        expect(out).toMatchObject({
            kind: 'error',
            response: { error: { code: RPC.InvalidRequest } },
        });
    });
    it('rejects a non-string method', () => {
        expect(parsePayload('{"jsonrpc":"2.0","id":1,"method":42}')).toMatchObject({
            kind: 'error',
        });
    });
    it('rejects an object id, which JSON-RPC does not permit', () => {
        expect(parsePayload('{"jsonrpc":"2.0","id":{"a":1},"method":"ping"}')).toMatchObject({ kind: 'error' });
    });
    it('rejects a bare JSON scalar', () => {
        expect(parsePayload('"hello"')).toMatchObject({ kind: 'error' });
        expect(parsePayload('null')).toMatchObject({ kind: 'error' });
    });
    it('rejects an empty batch', () => {
        expect(parsePayload('[]')).toMatchObject({
            kind: 'error',
            response: { error: { code: RPC.InvalidRequest } },
        });
    });
    it('rejects a batch over the limit, which would tie up the main process', () => {
        const call = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
        expect(parsePayload(JSON.stringify(Array.from({ length: 51 }, () => call)))).toMatchObject({
            kind: 'error',
            response: { error: { code: RPC.InvalidRequest } },
        });
        expect(parsePayload(JSON.stringify(Array.from({ length: 50 }, () => call)))).toMatchObject({ kind: 'batch' });
    });
});
describe('parsePayload — batches', () => {
    it('parses several messages', () => {
        const out = parsePayload('[{"jsonrpc":"2.0","id":1,"method":"ping"},{"jsonrpc":"2.0","method":"notifications/initialized"}]');
        expect(out.kind).toBe('batch');
        if (out.kind !== 'batch')
            throw new Error('expected batch');
        expect(out.messages).toHaveLength(2);
    });
    it('rejects the whole batch when one entry is malformed', () => {
        // Half-processing a batch would answer some ids and silently drop others.
        expect(parsePayload('[{"jsonrpc":"2.0","id":1,"method":"ping"},{"bad":true}]')).toMatchObject({ kind: 'error' });
    });
});
describe('isNotification', () => {
    it('treats a missing id as a notification', () => {
        expect(isNotification({ jsonrpc: '2.0', method: 'x' })).toBe(true);
    });
    it('does not treat id 0 as a notification', () => {
        // Truthiness here would drop a real response on the floor.
        expect(isNotification({ jsonrpc: '2.0', id: 0, method: 'x' })).toBe(false);
    });
    it('does not treat an empty-string id as a notification', () => {
        expect(isNotification({ jsonrpc: '2.0', id: '', method: 'x' })).toBe(false);
    });
});
describe('response builders', () => {
    it('builds a success envelope', () => {
        expect(success(7, { ok: true })).toEqual({
            jsonrpc: '2.0',
            id: 7,
            result: { ok: true },
        });
    });
    it('builds a failure envelope', () => {
        expect(failure(7, RPC.MethodNotFound, 'nope')).toEqual({
            jsonrpc: '2.0',
            id: 7,
            error: { code: RPC.MethodNotFound, message: 'nope' },
        });
    });
    it('uses a null id when there is none to answer', () => {
        expect(failure(null, RPC.ParseError, 'Parse error').id).toBeNull();
    });
});
