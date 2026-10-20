import { describe, it, expect } from 'vitest';

import { createPopupGate } from '../src/main/popupGate';

/**
 * The preview opens a page's pop-up in the system browser only just after
 * a press in it, once per press. see docs/audits/2026-10-20-repo-audit.md, finding 19
 */

const clock = (): { now: () => number; advance: (ms: number) => void } => {
  let t = 0;
  return { now: () => t, advance: (ms) => (t += ms) };
};

describe('createPopupGate', () => {
  it('refuses a pop-up with no press before it: a timer can’t open tabs', () => {
    const gate = createPopupGate(clock().now);
    expect(gate.allow()).toBe(false);
  });

  it('allows one pop-up right after a click, and not a second', () => {
    const c = clock();
    const gate = createPopupGate(c.now);
    gate.noteInput('mouseDown');
    c.advance(100);
    expect(gate.allow()).toBe(true);
    expect(gate.allow()).toBe(false);
  });

  it('refuses one that comes too long after the press', () => {
    const c = clock();
    const gate = createPopupGate(c.now, 1000);
    gate.noteInput('keyDown');
    c.advance(1500);
    expect(gate.allow()).toBe(false);
  });

  it('ignores input that isn’t a press, such as moving the pointer', () => {
    const gate = createPopupGate(clock().now);
    gate.noteInput('mouseMove');
    expect(gate.allow()).toBe(false);
  });
});
