import { describe, it, expect } from 'vitest';

import { elementToStyle } from '@lib/elementToStyle';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { DEFAULT_BREAKPOINTS } from '@shared/types';
import { applyPatchWithAxisRouting } from '@store/canvas/patchRouting';

/**
 * An offset the model's pixel x / y can't hold — `left: 50%` centring a
 * glow — is kept verbatim. It used to be read as 0, so opening a project
 * an agent had written rewrote the glow to `left: 0px` and moved it.
 * see docs/notes/position-offsets.md
 */

const TSX = `<div data-scamp-id="root" className={styles.root}>
  <div data-scamp-id="f88e" className={styles.glow_f88e}></div>
</div>`;

const css = (glow: string): string => `.root {
  width: 100%;
  position: relative;
}

.glow_f88e {
  width: 1000px;
  height: 760px;
${glow}
}
`;

const roundTrip = (cssText: string): { css: string; elements: ReturnType<typeof parseCode>['elements'] } => {
  const parsed = parseCode(TSX, cssText, { breakpoints: DEFAULT_BREAKPOINTS });
  const code = generateCode({ elements: parsed.elements, rootId: parsed.rootId, pageName: 'P', breakpoints: DEFAULT_BREAKPOINTS });
  return { css: code.css, elements: parsed.elements };
};

describe('offsets the model holds as pixels', () => {
  it('reads a pixel left and top into x and y', () => {
    const { elements } = roundTrip(css('  position: absolute;\n  left: 40px;\n  top: -240px;'));
    expect(elements['f88e']).toMatchObject({ x: 40, y: -240 });
    expect(elements['f88e']?.customProperties['left']).toBeUndefined();
  });
});

describe('offsets it can’t', () => {
  it('keeps left: 50% and writes it back once, in place of the pixels', () => {
    const { css: out, elements } = roundTrip(
      css('  position: absolute;\n  left: 50%;\n  top: -240px;\n  transform: translateX(-50%);')
    );
    expect(elements['f88e']?.customProperties['left']).toBe('50%');
    expect(out).toContain('left: 50%;');
    expect(out).not.toContain('left: 0px;');
    expect(out.match(/left:/g)).toHaveLength(1);
  });

  it('keeps calc(), tokens and auto for top as well', () => {
    for (const value of ['calc(50% - 20px)', 'var(--header-h)', 'auto']) {
      const { css: out } = roundTrip(css(`  position: absolute;\n  left: 10px;\n  top: ${value};`));
      expect(out).toContain(`top: ${value};`);
      expect(out.match(/top:/g)).toHaveLength(1);
    }
  });

  it('round-trips byte for byte', () => {
    const once = roundTrip(css('  position: absolute;\n  left: 50%;\n  top: 10%;')).css;
    expect(roundTrip(once).css).toBe(once);
  });

  it('keeps one written at a breakpoint', () => {
    const cssText = `${css('  position: absolute;\n  left: 40px;\n  top: 0px;')}
@media (max-width: 768px) {
  .glow_f88e {
    left: 50%;
  }
}
`;
    const { css: out, elements } = roundTrip(cssText);
    expect(elements['f88e']?.breakpointOverrides?.['tablet']?.customProperties?.['left']).toBe('50%');
    expect(out).toMatch(/@media \(max-width: 768px\) \{[\s\S]*left: 50%;/);
  });
});

describe('moving an element replaces a kept offset', () => {
  const glow = (): NonNullable<ReturnType<typeof parseCode>['elements'][string]> => {
    const el = roundTrip(css('  position: absolute;\n  left: 50%;\n  top: 10%;')).elements['f88e'];
    if (el === undefined) throw new Error('fixture');
    return el;
  };

  it('drops left when x is set, and keeps top', () => {
    const moved = applyPatchWithAxisRouting(glow(), { x: 120 }, 'desktop', null);
    expect(moved.x).toBe(120);
    expect(moved.customProperties['left']).toBeUndefined();
    expect(moved.customProperties['top']).toBe('10%');
  });

  it('drops both on a move that sets x and y', () => {
    const moved = applyPatchWithAxisRouting(glow(), { x: 1, y: 2 }, 'desktop', null);
    expect(moved.customProperties).not.toHaveProperty('left');
    expect(moved.customProperties).not.toHaveProperty('top');
  });

  it('leaves a kept offset alone when the patch doesn’t move the element', () => {
    const el = glow();
    expect(applyPatchWithAxisRouting(el, { opacity: 0.5 }, 'desktop', null).customProperties['left']).toBe('50%');
  });

  it('drops the one at the breakpoint being edited, not the base one', () => {
    const el = { ...glow(), breakpointOverrides: { tablet: { customProperties: { left: '30%' } } } };
    const moved = applyPatchWithAxisRouting(el, { x: 5 }, 'tablet', null);
    expect(moved.breakpointOverrides?.['tablet']).toMatchObject({ x: 5 });
    expect(moved.breakpointOverrides?.['tablet']?.customProperties?.['left']).toBeUndefined();
    expect(moved.customProperties['left']).toBe('50%');
  });
});

describe('an element anchored by right or bottom alone', () => {
  const rightOnly = '  position: absolute;\n  top: 20px;\n  right: 5.333cqw;';

  it('round-trips with no left written', () => {
    const first = roundTrip(css(rightOnly)).css;
    expect(first).not.toMatch(/\bleft:/);
    expect(roundTrip(first).css).toBe(first);
  });

  it('writes no top beside a bottom alone', () => {
    const { css: out } = roundTrip(css('  position: absolute;\n  left: 8px;\n  bottom: 12px;'));
    expect(out).not.toMatch(/\btop:/);
    expect(out).toContain('bottom: 12px;');
  });

  it('keeps an explicit left: 0 beside right: 0, so the element still stretches', () => {
    const { css: out, elements } = roundTrip(css('  position: absolute;\n  left: 0;\n  top: 0;\n  right: 0;'));
    expect(elements['f88e']?.customProperties['left']).toBe('0');
    expect(out).toContain('left: 0;');
    expect(out.match(/\bleft:/g)).toHaveLength(1);
  });

  it('draws on the canvas with no left, so right places it', () => {
    const el = roundTrip(css(rightOnly)).elements['f88e'];
    if (el === undefined) throw new Error('fixture');
    const style = elementToStyle(el, 'none', undefined, [], null, 'scamp', false, 900);
    expect(style.left).toBeUndefined();
    expect(style.right).toBe('5.333cqw');
    expect(style.top).toBe(20);
  });

  it('becomes left anchored when moved, and a stretched one keeps its right', () => {
    const anchored = roundTrip(css(rightOnly)).elements['f88e'];
    const stretched = roundTrip(css('  position: absolute;\n  left: 0;\n  top: 0;\n  right: 0;')).elements['f88e'];
    if (anchored === undefined || stretched === undefined) throw new Error('fixture');
    const moved = applyPatchWithAxisRouting(anchored, { x: 40 }, 'desktop', null);
    expect(moved.customProperties).not.toHaveProperty('right');
    const movedStretch = applyPatchWithAxisRouting(stretched, { x: 40 }, 'desktop', null);
    expect(movedStretch.customProperties['right']).toBe('0');
    expect(movedStretch.customProperties).not.toHaveProperty('left');
  });
});
