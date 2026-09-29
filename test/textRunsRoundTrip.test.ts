import { describe, it, expect } from 'vitest';

import { DEFAULT_RECT_STYLES } from '@lib/defaults';
import { ROOT_ELEMENT_ID, type ScampElement } from '@lib/element';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import type { TextRun } from '@lib/textRuns';

/**
 * Styled runs survive generateCode → parseCode.
 *
 * Phase 3 of `docs/plans/inline-spans-plan.md`. Without this a run can
 * be rendered but not saved, which is worse than not having runs: the
 * styling would vanish on the next reload with nothing to explain it.
 */

const base = {
  ...DEFAULT_RECT_STYLES,
  x: 0,
  y: 0,
  customProperties: {},
};

const tree = (runs: TextRun[]): Record<string, ScampElement> => ({
  [ROOT_ELEMENT_ID]: {
    ...base,
    id: ROOT_ELEMENT_ID,
    type: 'rectangle',
    parentId: null,
    childIds: ['t1'],
    name: 'root',
  },
  t1: {
    ...base,
    id: 't1',
    type: 'text',
    parentId: ROOT_ELEMENT_ID,
    childIds: [],
    name: 'hero',
    text: runs.map((r) => r.text).join(''),
    runs,
  },
});

const roundTrip = (runs: TextRun[]): ScampElement | undefined => {
  const { tsx, css } = generateCode({
    elements: tree(runs),
    rootId: ROOT_ELEMENT_ID,
    pageName: 'home',
  });
  return parseCode(tsx, css).elements['t1'];
};

const GRADIENT_SENTENCE: TextRun[] = [
  { text: 'works ' },
  { text: 'alongside', style: { color: '#0ACD95' } },
  { text: ' AI.' },
];

describe('styled runs round-trip', () => {
  it('keeps the words, the split and the style', () => {
    expect(roundTrip(GRADIENT_SENTENCE)?.runs).toEqual(GRADIENT_SENTENCE);
  });

  it('keeps the spaces around the styled word', () => {
    // The whole reason runs exist. `worksalongsideAI.` is the bug.
    expect(roundTrip(GRADIENT_SENTENCE)?.text).toBe('works alongside AI.');
  });

  it('writes the run as a span with its own class', () => {
    const { tsx, css } = generateCode({
      elements: tree(GRADIENT_SENTENCE),
      rootId: ROOT_ELEMENT_ID,
      pageName: 'home',
    });
    expect(tsx).toContain('<span className={styles.hero_t1__r1}>alongside</span>');
    expect(css).toContain('.hero_t1__r1 {');
    expect(css).toContain('color: #0ACD95;');
  });

  it('leaves a plain run bare, so one coloured word is one span', () => {
    const { tsx } = generateCode({
      elements: tree(GRADIENT_SENTENCE),
      rootId: ROOT_ELEMENT_ID,
      pageName: 'home',
    });
    expect(tsx.match(/<span/g)).toHaveLength(1);
  });

  it('round-trips more than one style on one run', () => {
    const runs: TextRun[] = [
      { text: 'a ' },
      { text: 'bold red', style: { color: '#ff0000', fontWeight: 700 } },
    ];
    expect(roundTrip(runs)?.runs).toEqual(runs);
  });

  it('round-trips two differently styled runs', () => {
    const runs: TextRun[] = [
      { text: 'red', style: { color: '#ff0000' } },
      { text: ' and ' },
      { text: 'blue', style: { color: '#0000ff' } },
    ];
    expect(roundTrip(runs)?.runs).toEqual(runs);
  });

  it('round-trips gradient text', () => {
    // The gainwix case: a background clipped to the glyphs.
    const runs: TextRun[] = [
      { text: 'An ' },
      {
        text: 'AI studio',
        style: { backgroundImage: 'linear-gradient(90deg, #0ACD95 0%, #6940F2 100%)' },
      },
    ];
    expect(roundTrip(runs)?.runs).toEqual(runs);
  });

  it('writes no run class for text that has none', () => {
    const { tsx, css } = generateCode({
      elements: tree([{ text: 'An AI studio' }]),
      rootId: ROOT_ELEMENT_ID,
      pageName: 'home',
    });
    expect(tsx).not.toContain('__r');
    expect(css).not.toContain('__r');
  });

  it('leaves an element with one plain run without a runs field', () => {
    // Otherwise every text element in every project gains one, and the
    // round trip stops being an equality check.
    expect(roundTrip([{ text: 'An AI studio' }])?.runs).toBeUndefined();
  });
});
