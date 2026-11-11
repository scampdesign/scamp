import { describe, it, expect } from 'vitest';
import postcss from 'postcss';

import { generateCode } from '../src/renderer/lib/generateCode';
import { parseCode } from '../src/renderer/lib/parseCode';

/**
 * Regression coverage for the 2026-06-19 style-loss bug: editing a value in
 * the CSS panel on an agent-seeded project collapsed every element to
 * `position: absolute; left: 0; top: 0` and persisted the loss to disk.
 *
 * Two root causes (see docs/plans/2026-06-19-style-loss-on-css-edit.md):
 *   A) raw/verbatim blocks were re-emitted without inter-declaration
 *      semicolons -> invalid CSS;
 *   B) any CSS parse error made parseCode return an empty class map ->
 *      every element fell back to defaults.
 */

const TSX = `import styles from './page.module.css';

export default function Page() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <section data-scamp-id="sec_a1" className={styles.sec_a1}>
        <div data-scamp-id="card_a2" className={styles.card_a2}>
          <span data-scamp-id="arrow_a3" className={styles.arrow_a3}></span>
        </div>
      </section>
    </div>
  );
}
`;

// A card with a raw descendant-hover block carrying TWO declarations — the
// exact shape ("color + transform") that lost its semicolon in the wild.
const CSS = `.root {
  width: 100%;
  min-height: 100vh;
  position: relative;
}

.sec_a1 {
  display: flex;
  flex-direction: column;
  padding: 24px;
}

.card_a2 {
  display: flex;
  gap: 8px;
  background: #111111;
}

.card_a2:hover .arrow_a3 {
  color: #ffffff;
  transform: translate(2px, -2px);
}

.arrow_a3 {
  width: 16px;
  height: 16px;
}
`;

const regen = (tsx: string, css: string): { tsx: string; css: string } => {
  const parsed = parseCode(tsx, css, {});
  return generateCode({
    elements: parsed.elements,
    rootId: parsed.rootId,
    pageName: 'page',
    breakpoints: [],
    customMediaBlocks: parsed.customMediaBlocks,
    pageKeyframesBlocks: parsed.keyframesBlocks,
    cssModuleImportName: 'page',
    isComponent: false,
  });
};

describe('style-loss regression — raw blocks stay valid CSS (bug A)', () => {
  it('re-emits a two-declaration raw hover block with semicolons', () => {
    const out = regen(TSX, CSS);
    // The separating semicolon must survive, or the next parse fails.
    expect(out.css).toContain('color: #ffffff;');
    expect(out.css).toContain('transform: translate(2px, -2px);');
  });

  it('produces CSS that re-parses without a syntax error', () => {
    const out = regen(TSX, CSS);
    expect(() => postcss.parse(out.css)).not.toThrow();
  });

  it('is a stable round-trip fixpoint (no drift on the second pass)', () => {
    const once = regen(TSX, CSS);
    const twice = regen(TSX, once.css);
    expect(twice.css).toBe(once.css);
    // And nothing collapsed to bare defaults.
    expect(twice.css).toContain('display: flex');
    expect(twice.css).not.toMatch(/\.sec_a1 \{\s*position: absolute;/);
  });
});

describe('style-loss regression — malformed CSS does not wipe the page (bug B)', () => {
  // Same file, but the hover block is missing the semicolon after `color`
  // — exactly what the old emitter produced. postcss.parse throws on this.
  const MALFORMED = CSS.replace('color: #ffffff;', 'color: #ffffff');

  it('strict postcss still rejects the malformed input (guards the premise)', () => {
    expect(() => postcss.parse(MALFORMED)).toThrow();
  });

  it('keeps every well-formed element styled; only the bad block is dropped', () => {
    const out = regen(TSX, MALFORMED);
    // The flex layout survives — NOT collapsed to position:absolute.
    expect(out.css).toContain('display: flex');
    expect(out.css).toMatch(/\.sec_a1 \{[^}]*display: flex/);
    expect(out.css).toMatch(/\.card_a2 \{[^}]*background: #111111/);
    expect(out.css).not.toMatch(/\.sec_a1 \{\s*position: absolute;\s*left: 0px;\s*top: 0px;\s*\}/);
  });

  it('the recovered output is itself valid CSS', () => {
    const out = regen(TSX, MALFORMED);
    expect(() => postcss.parse(out.css)).not.toThrow();
  });
});

describe('rename resilience — class renamed on one side matches by hex id', () => {
  // TSX says styles.card_grid_a1b2; CSS only has .card_wrap_a1b2 (same id).
  const RENAME_TSX = `import styles from './page.module.css';

export default function Page() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <div data-scamp-id="card_grid_a1b2" className={styles.card_grid_a1b2}></div>
    </div>
  );
}
`;
  const RENAME_CSS = `.root {
  width: 100%;
  position: relative;
}

.card_wrap_a1b2 {
  display: flex;
  gap: 12px;
  padding: 20px;
}
`;

  it('recovers the renamed element styles instead of collapsing to defaults', () => {
    const out = regen(RENAME_TSX, RENAME_CSS);
    // Styles survive and re-emit under the TSX-side name (healing the desync).
    expect(out.css).toMatch(/\.card_grid_a1b2 \{[^}]*display: flex/);
    expect(out.css).toMatch(/\.card_grid_a1b2 \{[^}]*padding: 20px/);
    expect(out.css).not.toMatch(/\.card_grid_a1b2 \{\s*position: absolute;\s*left: 0px;\s*top: 0px;\s*\}/);
  });

  it('does NOT guess when two CSS classes share the same hex id (ambiguous)', () => {
    const ambiguousCss =
      RENAME_CSS + `\n.other_wrap_a1b2 {\n  display: block;\n  margin: 4px;\n}\n`;
    const out = regen(RENAME_TSX, ambiguousCss);
    // Ambiguous suffix -> no fallback -> element stays at defaults (safe).
    expect(out.css).toMatch(/\.card_grid_a1b2 \{\s*position: absolute;/);
  });

  it('leaves an exact class match untouched (no regression)', () => {
    const exactCss = RENAME_CSS.replace('card_wrap_a1b2', 'card_grid_a1b2');
    const out = regen(RENAME_TSX, exactCss);
    expect(out.css).toMatch(/\.card_grid_a1b2 \{[^}]*display: flex/);
  });
});

describe('style-loss regression — a repeated class block adds to the first', () => {
  const REPEAT_CSS = `${CSS}
.card_a2 {
  border-radius: 12px;
}

.card_a2:hover {
  opacity: 0.8;
}

.card_a2:hover {
  cursor: pointer;
}
`;

  it('keeps the first block when an agent appends a second one for the same class', () => {
    const out = regen(TSX, REPEAT_CSS);
    expect(out.css).toMatch(/\.card_a2 \{[^}]*display: flex/);
    expect(out.css).toMatch(/\.card_a2 \{[^}]*background: #111111/);
    expect(out.css).toMatch(/\.card_a2 \{[^}]*border-radius: 12px/);
  });

  it('keeps both repeated state blocks', () => {
    const out = regen(TSX, REPEAT_CSS);
    expect(out.css).toMatch(/\.card_a2:hover \{[^}]*opacity: 0\.8/);
    expect(out.css).toMatch(/\.card_a2:hover \{[^}]*cursor: pointer/);
  });

  it('lets the later block win when both set the same property', () => {
    const out = regen(TSX, `${CSS}\n.card_a2 {\n  background: #222222;\n}\n`);
    expect(out.css).toMatch(/\.card_a2 \{[^}]*background: #222222/);
    expect(out.css).not.toContain('#111111');
  });
});
