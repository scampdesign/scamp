import { describe, it, expect } from 'vitest';

import { buildReport } from '@lib/importReport';
import type { ImportFinding } from '@lib/importReduce';

/**
 * The import report.
 *
 * An import is a lossy translation, and the difference between a tool
 * you trust and one you don't is whether it tells you where it lied.
 * These cases are mostly about readability under load — the report has
 * to stay useful on a page that produced three hundred findings, which
 * is exactly when someone needs it.
 * see docs/plans/website-import-plan.md
 */

const finding = (kind: string, at?: string): ImportFinding =>
  ({ kind, ...(at === undefined ? {} : { at }) }) as ImportFinding;

describe('buildReport', () => {
  it('groups repeats into one line with a count', () => {
    const report = buildReport([
      finding('pseudo-element', 'a::before'),
      finding('pseudo-element', 'b::before'),
      finding('pseudo-element', 'c::after'),
    ]);
    expect(report).toHaveLength(1);
    expect(report[0]?.count).toBe(3);
    expect(report[0]?.label).toContain('3 decorative');
  });

  it('pluralises for one', () => {
    const report = buildReport([finding('canvas', 'canvas')]);
    expect(report[0]?.label).toContain('1 <canvas> element');
    expect(report[0]?.label).not.toContain('elements');
  });

  it('puts losses before translations, whatever their counts', () => {
    // 200 collapsed wrappers are bookkeeping; one dropped icon is not,
    // and burying it under them is how a report stops being read.
    const report = buildReport([
      ...Array.from({ length: 200 }, (_, i) => finding('collapsed-wrapper', `div${i}`)),
      finding('pseudo-element', 'a::before'),
    ]);
    expect(report[0]?.kind).toBe('pseudo-element');
    expect(report[0]?.fidelity).toBe('lost');
    expect(report[1]?.fidelity).toBe('exact');
  });

  it('orders within a group by how much of the page it touched', () => {
    const report = buildReport([
      finding('collapsed-wrapper', 'a'),
      ...Array.from({ length: 5 }, (_, i) => finding('block-to-flex', `b${i}`)),
    ]);
    expect(report.map((g) => g.kind)).toEqual(['block-to-flex', 'collapsed-wrapper']);
  });

  it('keeps a few locations, not all of them', () => {
    const report = buildReport(
      Array.from({ length: 50 }, (_, i) => finding('pseudo-element', `el${i}::before`))
    );
    expect(report[0]?.count).toBe(50);
    expect(report[0]?.examples.length).toBeLessThanOrEqual(4);
    expect(report[0]?.examples[0]).toBe('el0::before');
  });

  it('does not repeat the same location twice', () => {
    const report = buildReport([
      finding('pseudo-element', 'nav::before'),
      finding('pseudo-element', 'nav::before'),
    ]);
    expect(report[0]?.examples).toEqual(['nav::before']);
  });

  it('marks a translation exact, so it is not read as damage', () => {
    // Turning a block container into a flex column changes the file and
    // changes nothing you can see.
    const report = buildReport([finding('block-to-flex', 'div')]);
    expect(report[0]?.fidelity).toBe('exact');
  });

  it.each([
    ['pseudo-element', 'lost'],
    ['canvas', 'lost'],
    ['iframe', 'lost'],
    ['shadow-root', 'lost'],
    ['unsupported-display', 'lost'],
    ['marker-leaked', 'lost'],
    ['breakpoint-absent', 'lost'],
    ['svg', 'rendered-fallback'],
    ['inline-kept', 'rendered-fallback'],
    ['background-image', 'rendered-fallback'],
    ['dropped-computed-size', 'approximated'],
    ['revealed-on-scroll', 'approximated'],
    ['grid-tracks-to-fr', 'approximated'],
    ['collapsed-wrapper', 'exact'],
    ['block-to-flex', 'exact'],
    ['pseudo-materialized', 'exact'],
  ])('grades %s as %s', (kind, fidelity) => {
    expect(buildReport([finding(kind, 'x')])[0]?.fidelity).toBe(fidelity);
  });

  // The whole reason the boolean was replaced. An inline icon kept as
  // markup renders perfectly — a pixel diff scores it 100% — and cannot
  // be edited as shapes. Neither `lost` nor `exact` could say that.
  // see docs/agent-native-review.md
  it('separates a fallback that renders from one that vanished', () => {
    const svg = buildReport([finding('svg', 'i.icon')])[0];
    const gone = buildReport([finding('canvas', 'canvas#chart')])[0];
    expect(svg?.fidelity).toBe('rendered-fallback');
    expect(gone?.fidelity).toBe('lost');
    expect(svg?.fidelity).not.toBe(gone?.fidelity);
  });

  it('says what you can still edit about a fallback', () => {
    // A fallback entry is not simply bad news, and an entry that only
    // said what was lost would read as though it were.
    expect(buildReport([finding('svg', 'i')])[0]?.editable).toContain('paths are not');
    expect(buildReport([finding('block-to-flex', 'div')])[0]?.editable).toBeUndefined();
  });

  it('orders lost, then fallback, then approximated, then exact', () => {
    const report = buildReport([
      finding('block-to-flex', 'a'),
      finding('revealed-on-scroll', 'b'),
      finding('svg', 'c'),
      finding('canvas', 'd'),
    ]);
    expect(report.map((g) => g.fidelity)).toEqual([
      'lost',
      'rendered-fallback',
      'approximated',
      'exact',
    ]);
  });

  it('still reports a kind nobody wrote a description for', () => {
    // A finding no one described is still a finding; dropping it would
    // make the report quietly wrong.
    const report = buildReport([finding('some-new-kind', 'x'), finding('some-new-kind', 'y')]);
    expect(report[0]?.label).toBe('2 x some new kind');
    // Graded `lost`, not `exact`: a finding nobody has classified is not
    // evidence that it cost nothing.
    expect(report[0]?.fidelity).toBe('lost');
  });

  it('counts a finding that stands for more than one element', () => {
    // The breakpoint passes raise one finding per breakpoint, not per
    // element. Counting findings said "1 element is missing at a
    // narrower width" whether it was one element or forty.
    const report = buildReport([
      { kind: 'breakpoint-absent', at: 'tablet', count: 12 },
      { kind: 'breakpoint-absent', at: 'mobile', count: 28 },
    ] as ImportFinding[]);
    expect(report[0]?.count).toBe(40);
    expect(report[0]?.label).toContain('40 elements are');
  });

  it('still names the breakpoints rather than the elements', () => {
    const report = buildReport([
      { kind: 'breakpoint-captured', at: 'tablet', count: 9 },
    ] as ImportFinding[]);
    expect(report[0]?.examples).toEqual(['tablet']);
  });

  it('treats a finding with no count as standing for one thing', () => {
    expect(buildReport([finding('pseudo-element', 'a::before')])[0]?.count).toBe(1);
  });

  it('returns nothing for a clean import', () => {
    expect(buildReport([])).toEqual([]);
  });

  it('survives findings that carry no location', () => {
    const report = buildReport([finding('node-capped')]);
    expect(report[0]?.examples).toEqual([]);
    expect(report[0]?.label).toContain('larger than one import');
  });
});
