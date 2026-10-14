import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryRegistry } from '../src/main/mcp/pendingQueries';
import type { McpQueryArgs } from '@shared/types';

/**
 * The pull-through correlation layer. Its whole job is that a query either
 * gets its answer or fails visibly — never hangs, never resolves with
 * somebody else's data.
 * see docs/archive/2026-08-06-mcp-server-plan.md
 */

describe('createQueryRegistry', () => {
  let sent: McpQueryArgs[];
  let ids: number;

  const registry = (timeoutMs = 2000) => {
    ids = 0;
    return createQueryRegistry({
      send: (payload) => sent.push(payload),
      timeoutMs,
      makeRequestId: () => `req-${++ids}`,
    });
  };

  beforeEach(() => {
    sent = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the tool and args with a correlation id', async () => {
    const r = registry();
    const promise = r.query('scamp_get_selected_element', { a: 1 });
    expect(sent).toEqual([
      { requestId: 'req-1', tool: 'scamp_get_selected_element', args: { a: 1 } },
    ]);
    r.resolve({ requestId: 'req-1', ok: true, data: 'x' });
    await expect(promise).resolves.toBe('x');
  });

  it('resolves with the data the renderer sent back', async () => {
    const r = registry();
    const promise = r.query('t', {});
    r.resolve({ requestId: 'req-1', ok: true, data: { id: 'a1b2' } });
    await expect(promise).resolves.toEqual({ id: 'a1b2' });
  });

  it('rejects when the renderer reports a failure', async () => {
    const r = registry();
    const promise = r.query('t', {});
    r.resolve({ requestId: 'req-1', ok: false, error: 'no project open' });
    await expect(promise).rejects.toThrow('no project open');
  });

  it('rejects with an actionable message on timeout', async () => {
    const r = registry(2000);
    const promise = r.query('t', {});
    const assertion = expect(promise).rejects.toThrow(/did not respond/i);
    await vi.advanceTimersByTimeAsync(2001);
    await assertion;
  });

  it('does not hang forever when the renderer never replies', async () => {
    const r = registry(500);
    const promise = r.query('t', {});
    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(600);
    await assertion;
    expect(r.pending()).toBe(0);
  });

  it('keeps concurrent queries apart', async () => {
    const r = registry();
    const first = r.query('a', {});
    const second = r.query('b', {});
    // Answer out of order — correlation must be by id, not arrival.
    r.resolve({ requestId: 'req-2', ok: true, data: 'second' });
    r.resolve({ requestId: 'req-1', ok: true, data: 'first' });
    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
  });

  it('ignores a reply for an unknown id', async () => {
    const r = registry();
    const promise = r.query('t', {});
    expect(() => r.resolve({ requestId: 'nope', ok: true, data: 1 })).not.toThrow();
    r.resolve({ requestId: 'req-1', ok: true, data: 'ok' });
    await expect(promise).resolves.toBe('ok');
  });

  it('drops a reply that arrives after its timeout', async () => {
    // The promise already rejected; resolving it again would be a silent
    // contract break.
    const r = registry(500);
    const promise = r.query('t', {});
    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(600);
    await assertion;
    expect(() =>
      r.resolve({ requestId: 'req-1', ok: true, data: 'late' })
    ).not.toThrow();
    expect(r.pending()).toBe(0);
  });

  it('clears the timeout once answered, so nothing fires later', async () => {
    const r = registry(500);
    const promise = r.query('t', {});
    r.resolve({ requestId: 'req-1', ok: true, data: 'ok' });
    await expect(promise).resolves.toBe('ok');
    await vi.advanceTimersByTimeAsync(1000);
    expect(r.pending()).toBe(0);
  });

  it('tracks how many queries are in flight', async () => {
    const r = registry();
    expect(r.pending()).toBe(0);
    const promise = r.query('t', {});
    expect(r.pending()).toBe(1);
    r.resolve({ requestId: 'req-1', ok: true, data: null });
    await promise;
    expect(r.pending()).toBe(0);
  });

  it('fails everything in flight on rejectAll', async () => {
    // Window closed / project closed / quitting — a pending query must not
    // sit there until its timeout.
    const r = registry();
    const first = r.query('a', {});
    const second = r.query('b', {});
    r.rejectAll('window closed');
    await expect(first).rejects.toThrow('window closed');
    await expect(second).rejects.toThrow('window closed');
    expect(r.pending()).toBe(0);
  });

  it('rejects when send itself throws', async () => {
    // The window can disappear between our check and the send.
    const r = createQueryRegistry({
      send: () => {
        throw new Error('window destroyed');
      },
      makeRequestId: () => 'req-1',
    });
    await expect(r.query('t', {})).rejects.toThrow('window destroyed');
    expect(r.pending()).toBe(0);
  });
});
