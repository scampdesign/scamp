import { describe, it, expect } from 'vitest';

import { cssToScampProperty } from '@lib/cssPropertyMap';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { parsePaddingShorthandOrNull } from '@lib/parsers';
import {
  AUTO_SPACE_VALUE,
  formatSpaceShorthand,
  hasAutoSide,
  isTokenSpaceValue,
  spaceValueEquals,
  tokenSpaceValue,
} from '@lib/spaceValue';
import { DEFAULT_BREAKPOINTS } from '@shared/types';

/**
 * `auto` on a margin side — `margin: 0 auto` centers. Item 4 of
 * docs/archive/2026-10-13-checks-cleanup-plan.md
 */

describe('the auto space value', () => {
  it('formats, compares, and is not a token', () => {
    expect(formatSpaceShorthand([0, AUTO_SPACE_VALUE, 0, AUTO_SPACE_VALUE])).toBe('0px auto');
    expect(spaceValueEquals(AUTO_SPACE_VALUE, { kind: 'auto' })).toBe(true);
    expect(spaceValueEquals(AUTO_SPACE_VALUE, 0)).toBe(false);
    expect(spaceValueEquals(AUTO_SPACE_VALUE, tokenSpaceValue('var(--m)'))).toBe(false);
    expect(isTokenSpaceValue(AUTO_SPACE_VALUE)).toBe(false);
    expect(hasAutoSide([0, AUTO_SPACE_VALUE, 0, 0])).toBe(true);
    expect(hasAutoSide([0, 8, 0, 8])).toBe(false);
  });
});

describe('parsing', () => {
  it('reads auto in a margin, not in padding', () => {
    expect(cssToScampProperty['margin']?.('0 auto')).toEqual({ margin: [0, AUTO_SPACE_VALUE, 0, AUTO_SPACE_VALUE] });
    expect(cssToScampProperty['padding']?.('0 auto')).toBeNull();
    expect(parsePaddingShorthandOrNull('auto', true)).toEqual([AUTO_SPACE_VALUE, AUTO_SPACE_VALUE, AUTO_SPACE_VALUE, AUTO_SPACE_VALUE]);
    expect(parsePaddingShorthandOrNull('auto')).toBeNull();
  });
});

const page = (css: string): string =>
  [
    "import styles from './p.module.css';",
    'export default function P() {',
    '  return (',
    '    <div data-scamp-id="root" className={styles.root}>',
    '      <div data-scamp-id="a1b2" className={styles.card_a1b2}></div>',
    '    </div>',
    '  );',
    '}',
  ].join('\n') + css;

const roundTrip = (css: string): { out: string; parsed: ReturnType<typeof parseCode> } => {
  const parsed = parseCode(page(''), css, { breakpoints: DEFAULT_BREAKPOINTS });
  return {
    parsed,
    out: generateCode({ elements: parsed.elements, rootId: parsed.rootId, pageName: 'P', breakpoints: DEFAULT_BREAKPOINTS }).css,
  };
};

describe('round trip', () => {
  it('types margin: 0 auto, and writes it last in the rule, where it sat as raw CSS', () => {
    const { out, parsed } = roundTrip('.root {\n  width: 100%;\n}\n\n.card_a1b2 {\n  width: 200px;\n  margin: 0 auto;\n}\n');
    expect(parsed.elements['a1b2']?.margin).toEqual([0, AUTO_SPACE_VALUE, 0, AUTO_SPACE_VALUE]);
    expect(parsed.elements['a1b2']?.customProperties['margin']).toBeUndefined();
    expect(out).toMatch(/\.card_a1b2 \{[^}]*margin: 0px auto;\n\}/);
  });

  it('keeps a root that centers itself — the root writes no other margin', () => {
    const { out } = roundTrip('.root {\n  width: 100%;\n  margin: 0 auto;\n}\n');
    expect(out).toMatch(/\.root \{[^}]*margin: 0px auto;/);
  });

  it('round-trips an auto margin at a breakpoint', () => {
    const { out } = roundTrip(
      '.root {\n  width: 100%;\n}\n\n.card_a1b2 {\n  width: 200px;\n}\n\n@media (max-width: 768px) {\n  .card_a1b2 {\n    margin: 0 auto;\n  }\n}\n'
    );
    expect(out).toMatch(/@media \(max-width: 768px\) \{\s*\.card_a1b2 \{\s*margin: 0px auto;/);
  });

  it('leaves a margin-left: auto longhand as raw CSS', () => {
    const { out, parsed } = roundTrip('.root {\n  width: 100%;\n}\n\n.card_a1b2 {\n  margin-left: auto;\n}\n');
    expect(parsed.elements['a1b2']?.customProperties['margin-left']).toBe('auto');
    expect(out).toContain('margin-left: auto;');
  });
});
