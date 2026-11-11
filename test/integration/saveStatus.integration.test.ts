import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FileWriteAckPayload } from '@shared/types';
import { createPendingWriteTracker } from '../../src/main/pendingWrites';

const TSX = '/project/home.tsx';
const CSS = '/project/home.module.css';
const OTHER = '/project/other.tsx';

describe('save status — pending writes tracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits an ack when the matching path is consumed', () => {
    const sent: FileWriteAckPayload[] = [];
    const tracker = createPendingWriteTracker((p) => sent.push(p), 400);

    tracker.register(TSX, 'write-1', true);
    const result = tracker.consume(TSX);

    expect(result).toEqual({ writeId: 'write-1', suppressChanged: true });
    expect(sent).toEqual([{ writeId: 'write-1', path: TSX }]);
    expect(tracker.size()).toBe(0);
  });

  it('hands back the content Scamp wrote, so the watcher can tell an agent write merged into the same event', () => {
    const tracker = createPendingWriteTracker(() => {}, 400);

    tracker.register(CSS, 'write-1', true, '.a { color: red; }');

    expect(tracker.consume(CSS)).toEqual({ writeId: 'write-1', suppressChanged: true, expected: '.a { color: red; }' });
  });

  it('returns null and does not emit when an unrelated path is consumed', () => {
    const sent: FileWriteAckPayload[] = [];
    const tracker = createPendingWriteTracker((p) => sent.push(p), 400);

    tracker.register(TSX, 'write-1', true);
    const result = tracker.consume(OTHER);

    expect(result).toBeNull();
    expect(sent).toEqual([]);
    expect(tracker.size()).toBe(1);
  });

  it('emits one ack per registered sibling path when both consumed in order', () => {
    const sent: FileWriteAckPayload[] = [];
    const tracker = createPendingWriteTracker((p) => sent.push(p), 400);

    tracker.register(TSX, 'write-1', true);
    tracker.register(CSS, 'write-1', true);

    tracker.consume(TSX);
    tracker.consume(CSS);

    expect(sent).toEqual([
      { writeId: 'write-1', path: TSX },
      { writeId: 'write-1', path: CSS },
    ]);
  });

  it('emits sibling acks regardless of arrival order', () => {
    const sent: FileWriteAckPayload[] = [];
    const tracker = createPendingWriteTracker((p) => sent.push(p), 400);

    tracker.register(TSX, 'write-1', true);
    tracker.register(CSS, 'write-1', true);

    tracker.consume(CSS);
    tracker.consume(TSX);

    expect(new Set(sent.map((p) => p.path))).toEqual(new Set([TSX, CSS]));
    expect(sent.every((p) => p.writeId === 'write-1')).toBe(true);
  });

  it('fires the watchdog ack on expiry when chokidar never consumes the path', () => {
    const sent: FileWriteAckPayload[] = [];
    const tracker = createPendingWriteTracker((p) => sent.push(p), 400);

    tracker.register(TSX, 'write-1', true);
    expect(sent).toEqual([]);

    vi.advanceTimersByTime(399);
    expect(sent).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(sent).toEqual([{ writeId: 'write-1', path: TSX }]);
    expect(tracker.size()).toBe(0);
  });

  it('does not fire the watchdog after cancel', () => {
    const sent: FileWriteAckPayload[] = [];
    const tracker = createPendingWriteTracker((p) => sent.push(p), 400);

    tracker.register(TSX, 'write-1', true);
    tracker.cancel(TSX);

    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([]);
    expect(tracker.size()).toBe(0);
  });

  it('preserves suppressChanged=false for patch writes', () => {
    const sent: FileWriteAckPayload[] = [];
    const tracker = createPendingWriteTracker((p) => sent.push(p), 400);

    tracker.register(CSS, 'patch-1', false);
    const result = tracker.consume(CSS);

    // The writeId rides along so `emitChange` can tag the broadcast as
    // Scamp's own write — the CSS panel's patch must not pause sync.
    expect(result).toEqual({ writeId: 'patch-1', suppressChanged: false });
    expect(sent).toEqual([{ writeId: 'patch-1', path: CSS }]);
  });

  it('acks the earlier writeId when the same path re-registers, then acks the newer one on consume', () => {
    // Real-world trigger: component rename. The syncBridge's
    // debounced flush dispatches a tracked write (id-1), then the
    // rename's own writeFile registers the same path under id-2
    // before chokidar fires. Without the early ack, the renderer's
    // tracker for id-1 waits 2s and surfaces a false "Save failed".
    const sent: FileWriteAckPayload[] = [];
    const tracker = createPendingWriteTracker((p) => sent.push(p), 400);

    tracker.register(TSX, 'write-1', true);
    tracker.register(TSX, 'write-2', true);

    // The first write should already be acked at this point — the
    // re-register superseded it on disk so the prior tracker can
    // safely transition out of its "saving" state.
    expect(sent).toEqual([{ writeId: 'write-1', path: TSX }]);

    tracker.consume(TSX);
    vi.advanceTimersByTime(1000);

    expect(sent).toEqual([
      { writeId: 'write-1', path: TSX },
      { writeId: 'write-2', path: TSX },
    ]);
  });

  it('isolates concurrent writes keyed by different paths', () => {
    const sent: FileWriteAckPayload[] = [];
    const tracker = createPendingWriteTracker((p) => sent.push(p), 400);

    tracker.register(TSX, 'write-1', true);
    tracker.register(CSS, 'write-2', false);

    tracker.consume(TSX);
    expect(sent).toEqual([{ writeId: 'write-1', path: TSX }]);

    tracker.consume(CSS);
    expect(sent).toEqual([
      { writeId: 'write-1', path: TSX },
      { writeId: 'write-2', path: CSS },
    ]);
  });
});
