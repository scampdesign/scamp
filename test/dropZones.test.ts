import { describe, expect, it } from 'vitest';

import {
  MAX_EDGE_BAND,
  MIN_EDGE_BAND,
  edgeBandFor,
  resolveDropZone,
  type DropZone,
} from '@lib/dropZones';

/**
 * The shared drop-target rule. Both drag surfaces resolve the cursor
 * through this, so the awkward cases (tiny rows, huge containers, leaves,
 * exact boundaries) are pinned here rather than by dragging pixels in an
 * e2e. see docs/archive/2026-08-13-drop-placement-helpers-plan.md
 */

/** A 100px-tall container starting at 0, unless overridden. */
const zoneAt = (
  cursor: number,
  opts: { size?: number; start?: number; canHoldChildren?: boolean } = {}
): DropZone =>
  resolveDropZone({
    rect: { start: opts.start ?? 0, size: opts.size ?? 100 },
    cursor,
    canHoldChildren: opts.canHoldChildren ?? true,
  });

describe('edgeBandFor', () => {
  it('is a quarter of the element between the clamps', () => {
    // 40px → 10px, which is inside [6, 16].
    expect(edgeBandFor(40)).toBe(10);
  });

  it('never drops below the minimum, however short the element', () => {
    // A 24px tree row would otherwise get a 6px band; a 10px one, 2.5px.
    expect(edgeBandFor(10)).toBe(MIN_EDGE_BAND);
    expect(edgeBandFor(0)).toBe(MIN_EDGE_BAND);
  });

  it('never exceeds the maximum, however tall the element', () => {
    // A 200px band on an 800px container would swallow the middle.
    expect(edgeBandFor(800)).toBe(MAX_EDGE_BAND);
  });
});

describe('resolveDropZone: a container', () => {
  it('reads the leading band as "before"', () => {
    expect(zoneAt(2)).toBe('before');
  });

  it('reads the middle as "inside"', () => {
    expect(zoneAt(50)).toBe('inside');
  });

  it('reads the trailing band as "after"', () => {
    expect(zoneAt(98)).toBe('after');
  });

  it('measures from the rect start, not from zero', () => {
    // The tree hands in viewport coordinates, so the origin matters.
    expect(zoneAt(502, { start: 500 })).toBe('before');
    expect(zoneAt(550, { start: 500 })).toBe('inside');
    expect(zoneAt(598, { start: 500 })).toBe('after');
  });

  it('gives a large container a mostly-inside body', () => {
    // 16px bands on 800px: everything from 16 to 784 is "inside".
    expect(zoneAt(20, { size: 800 })).toBe('inside');
    expect(zoneAt(780, { size: 800 })).toBe('inside');
    expect(zoneAt(4, { size: 800 })).toBe('before');
    expect(zoneAt(796, { size: 800 })).toBe('after');
  });
});

describe('resolveDropZone: a leaf', () => {
  const leaf = { canHoldChildren: false };

  it('never returns "inside", even dead centre', () => {
    // A child of an <img> isn't a thing. This is the bug the tree had:
    // it only excluded text, so images and inputs offered "inside".
    // The midpoint itself belongs to "after", deterministically.
    expect(zoneAt(49, leaf)).toBe('before');
    expect(zoneAt(50, leaf)).toBe('after');
  });

  it('splits at the midpoint instead', () => {
    expect(zoneAt(1, leaf)).toBe('before');
    expect(zoneAt(49, leaf)).toBe('before');
    expect(zoneAt(99, leaf)).toBe('after');
  });
});

describe('resolveDropZone: small elements', () => {
  it('keeps a usable middle on a typical tree row', () => {
    // 24px row, 6px bands: 6–18 is "inside", a third of the row.
    expect(zoneAt(3, { size: 24 })).toBe('before');
    expect(zoneAt(12, { size: 24 })).toBe('inside');
    expect(zoneAt(21, { size: 24 })).toBe('after');
  });

  it('behaves like a leaf when the bands would meet', () => {
    // At 12px the two 6px bands exactly cover it — there is no middle to
    // drop into, so offering a sliver of "inside" would be a lie.
    expect(zoneAt(3, { size: 12 })).toBe('before');
    expect(zoneAt(9, { size: 12 })).toBe('after');
  });

  it('behaves like a leaf when the bands would overlap', () => {
    expect(zoneAt(2, { size: 8 })).toBe('before');
    expect(zoneAt(6, { size: 8 })).toBe('after');
  });
});

describe('resolveDropZone: boundaries and degenerate input', () => {
  it('resolves the band boundary deterministically', () => {
    // A pixel of jitter across the boundary must not flicker between
    // three answers — the boundary itself belongs to the middle.
    expect(zoneAt(24, { size: 100 })).toBe('inside');
    expect(zoneAt(25, { size: 100 })).toBe('inside');
    expect(zoneAt(76, { size: 100 })).toBe('inside');
    expect(zoneAt(75, { size: 100 })).toBe('inside');
  });

  it('handles a cursor outside the element', () => {
    expect(zoneAt(-20)).toBe('before');
    expect(zoneAt(200)).toBe('after');
  });

  it('does not throw on a zero-size rect', () => {
    expect(zoneAt(0, { size: 0 })).toBe('after');
    expect(zoneAt(-1, { size: 0 })).toBe('before');
  });

  it('does not throw on a negative-size rect', () => {
    expect(() => zoneAt(5, { size: -10 })).not.toThrow();
  });
});
