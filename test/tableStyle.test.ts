import { describe, it, expect } from 'vitest';

import { generateCode } from '../src/renderer/lib/generateCode';
import { parseCode } from '../src/renderer/lib/parseCode';
import type { ScampElement, TableStyle } from '../src/renderer/lib/element';
import { matchTableRule, mergeTableStyle, tableStyleRules } from '../src/renderer/lib/tableStyle';

/**
 * Phase 3 of docs/archive/2026-10-05-tables-plan.md: row and cell styling is set once
 * on the table and derived into zero-specificity rules, so no row or
 * cell carries a copy of it.
 */

const TABLE_TSX = `<div data-scamp-id="root" className={styles.root}>
      <table data-scamp-id="t1" className={styles.rect_t1}>
        <thead data-scamp-id="t2" className={styles.rect_t2}>
          <tr data-scamp-id="t3" className={styles.rect_t3}>
            <th data-scamp-id="t4" className={styles.text_t4}>Name</th>
            <th data-scamp-id="t5" className={styles.text_t5}>DOB</th>
          </tr>
        </thead>
        <tbody data-scamp-id="t7" className={styles.rect_t7}>
          <tr data-scamp-id="t8" className={styles.rect_t8}>
            <td data-scamp-id="t9" className={styles.text_t9}>Smith</td>
            <td data-scamp-id="t10" className={styles.text_t10}>1980-04-01</td>
          </tr>
        </tbody>
      </table>
    </div>`;

const BASE_CSS = `.rect_t1 {
  display: grid;
  grid-template-columns: 2fr 120px;
}`;

const FULL_STYLE: TableStyle = {
  rowDivider: { width: 1, style: 'solid', color: 'var(--border)' },
  stripe: '#f5f5f5',
  stickyHeader: true,
  cellPadding: [8, 12, 8, 12],
  cellAlign: 'left',
};

const withTableStyle = (style: TableStyle | undefined): Record<string, ScampElement> => {
  const parsed = parseCode(TABLE_TSX, BASE_CSS);
  const table = parsed.elements['t1'];
  if (!table) throw new Error('fixture has no table');
  return { ...parsed.elements, t1: { ...table, tableStyle: style } };
};

const generate = (elements: Record<string, ScampElement>): { tsx: string; css: string } =>
  generateCode({ elements, rootId: 'root', pageName: 'patients' });

describe('tableStyleRules', () => {
  it('emits nothing when the table has no styling set', () => {
    expect(tableStyleRules('rect_t1', undefined)).toEqual([]);
    expect(tableStyleRules('rect_t1', {})).toEqual([]);
  });

  it('writes cell padding and alignment as one rule on th and td', () => {
    expect(
      tableStyleRules('rect_t1', { cellPadding: [8, 12, 8, 12], cellAlign: 'center' })
    ).toEqual([
      '.rect_t1 :where(th, td) {\n  padding: 8px 12px;\n  text-align: center;\n}',
    ]);
  });

  it('puts the divider on the row, not on each cell', () => {
    expect(
      tableStyleRules('rect_t1', {
        rowDivider: { width: 1, style: 'dashed', color: '#ddd' },
      })
    ).toEqual([':where(.rect_t1) :where(tr) {\n  border-bottom: 1px dashed #ddd;\n}']);
  });

  it('stripes even body rows with or without an authored tbody', () => {
    // The canvas has no tbody the user did not draw; the exported page
    // always does. Both arms are needed for the two to agree.
    const [rule] = tableStyleRules('rect_t1', { stripe: '#eee' });
    expect(rule).toContain(':where(.rect_t1) > :where(tbody) > :where(tr:nth-child(even))');
    expect(rule).toContain(':where(.rect_t1) > :where(tr:nth-child(even of tr))');
    expect(rule).toContain('background-color: #eee;');
  });

  it('makes the thead sticky at the top', () => {
    expect(tableStyleRules('rect_t1', { stickyHeader: true })).toEqual([
      ':where(.rect_t1) > :where(thead) {\n  position: sticky;\n  top: 0;\n  z-index: 1;\n}',
    ]);
  });

  it('emits nothing for a sticky header that is switched off', () => {
    expect(tableStyleRules('rect_t1', { stickyHeader: false })).toEqual([]);
  });

  it('gives row and header rules zero specificity, so a row rule still wins', () => {
    const rules = tableStyleRules('rect_t1', FULL_STYLE).filter(
      (rule) => !rule.startsWith('.rect_t1 :where(th, td)')
    );
    expect(rules).toHaveLength(3);
    for (const rule of rules) {
      // Strip every `:where(…)` (one nested paren level, for
      // `nth-child(…)`); only combinators may be left over.
      const selector = rule.slice(0, rule.indexOf('{'));
      const outside = selector.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, '');
      expect(outside).toMatch(/^[\s>,]*$/);
    }
  });
});

describe('the cell rule', () => {
  it('outranks the table reset, which is a bare th, td at (0,0,1)', () => {
    // Measured in Chromium: at zero specificity the padding came out 0.
    const [rule] = tableStyleRules('rect_t1', { cellPadding: [8, 8, 8, 8] });
    expect(rule?.startsWith('.rect_t1 :where(th, td) {')).toBe(true);
  });

  it('comes before every cell rule, so a cell\'s own padding wins the tie', () => {
    const parsed = parseCode(
      TABLE_TSX,
      `${BASE_CSS}\n.text_t4 { padding: 2px; }\n.text_t9 { padding: 2px; }`
    );
    const table = parsed.elements['t1'];
    if (!table) throw new Error('fixture has no table');
    const { css } = generate({
      ...parsed.elements,
      t1: { ...table, tableStyle: { cellPadding: [8, 8, 8, 8] } },
    });
    const cellsAt = css.indexOf('.rect_t1 :where(th, td)');
    expect(cellsAt).toBeGreaterThan(-1);
    expect(css.indexOf('.text_t4 {')).toBeGreaterThan(cellsAt);
    expect(css.indexOf('.text_t9 {')).toBeGreaterThan(cellsAt);
  });
});

describe('matchTableRule', () => {
  const decl = (prop: string, value: string): { prop: string; value: string } => ({
    prop,
    value,
  });

  it('returns null for a selector that is not a table rule', () => {
    expect(matchTableRule('.rect_t1', [decl('color', 'red')])).toBeNull();
    expect(matchTableRule(':where(.rect_t1) :where(li)', [decl('color', 'red')])).toBeNull();
    expect(matchTableRule('', [])).toBeNull();
  });

  it('recognises the subgrid rule so it is not stored', () => {
    expect(
      matchTableRule(
        ':where(.rect_t1) > :where(thead, tbody, tfoot),\n:where(.rect_t1) :where(tr)',
        []
      )
    ).toEqual({ kind: 'subgrid', className: 'rect_t1' });
  });

  it('tolerates whitespace changes in the selector', () => {
    expect(
      matchTableRule(':where(.rect_t1)   >:where(thead)', [
        decl('position', 'sticky'),
        decl('top', '0'),
        decl('z-index', '1'),
      ])
    ).toEqual({ kind: 'style', className: 'rect_t1', style: { stickyHeader: true } });
  });

  it('reads a divider with a function colour', () => {
    expect(
      matchTableRule(':where(.rect_t1) :where(tr)', [
        decl('border-bottom', '2px dotted rgb(0 0 0 / 10%)'),
      ])
    ).toEqual({
      kind: 'style',
      className: 'rect_t1',
      style: { rowDivider: { width: 2, style: 'dotted', color: 'rgb(0 0 0 / 10%)' } },
    });
  });

  it('reads token cell padding', () => {
    expect(
      matchTableRule('.rect_t1 :where(th, td)', [decl('padding', 'var(--space-sm)')])
    ).toEqual({
      kind: 'style',
      className: 'rect_t1',
      style: {
        cellPadding: [
          { kind: 'token', ref: 'var(--space-sm)' },
          { kind: 'token', ref: 'var(--space-sm)' },
          { kind: 'token', ref: 'var(--space-sm)' },
          { kind: 'token', ref: 'var(--space-sm)' },
        ],
      },
    });
  });

  it('keeps a rule raw when an extra declaration was added', () => {
    expect(
      matchTableRule(':where(.rect_t1) :where(tr)', [
        decl('border-bottom', '1px solid #ddd'),
        decl('color', 'red'),
      ])
    ).toEqual({ kind: 'raw', className: 'rect_t1' });
  });

  it('keeps a rule raw when re-emitting would reorder it', () => {
    // `solid 1px` is valid CSS, but the generator writes `1px solid` —
    // typing it would rewrite the line on the next save.
    expect(
      matchTableRule(':where(.rect_t1) :where(tr)', [decl('border-bottom', 'solid 1px #ddd')])
    ).toEqual({ kind: 'raw', className: 'rect_t1' });
  });

  it('keeps a rule raw when the divider style is not one Scamp models', () => {
    expect(
      matchTableRule(':where(.rect_t1) :where(tr)', [decl('border-bottom', '3px double #ddd')])
    ).toEqual({ kind: 'raw', className: 'rect_t1' });
  });

  it('keeps a rule raw when padding uses a unit Scamp does not model', () => {
    expect(
      matchTableRule('.rect_t1 :where(th, td)', [decl('padding', '1rem')])
    ).toEqual({ kind: 'raw', className: 'rect_t1' });
  });

  it('keeps a sticky rule raw when its offset is not zero', () => {
    expect(
      matchTableRule(':where(.rect_t1) > :where(thead)', [
        decl('position', 'sticky'),
        decl('top', '64px'),
        decl('z-index', '1'),
      ])
    ).toEqual({ kind: 'raw', className: 'rect_t1' });
  });

  it('keeps an empty styling rule raw rather than dropping it', () => {
    expect(matchTableRule(':where(.rect_t1) :where(tr)', [])).toEqual({
      kind: 'raw',
      className: 'rect_t1',
    });
  });
});

describe('table styling through generateCode and parseCode', () => {
  it('round-trips every setting into the same model', () => {
    const elements = withTableStyle(FULL_STYLE);
    const { tsx, css } = generate(elements);
    const parsed = parseCode(tsx, css);
    expect(parsed.elements['t1']?.tableStyle).toEqual(FULL_STYLE);
    expect(parsed.elements['t1']?.customSelectorBlocks).toBeUndefined();
  });

  it('is byte-stable across a second round-trip', () => {
    const first = generate(withTableStyle(FULL_STYLE));
    const reparsed = parseCode(first.tsx, first.css);
    const second = generate(reparsed.elements);
    expect(second.css).toBe(first.css);
  });

  it('writes nothing onto the rows or cells', () => {
    const { css } = generate(withTableStyle(FULL_STYLE));
    for (const cls of ['rect_t3', 'rect_t8', 'text_t9']) {
      const block = new RegExp(`\\.${cls} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
      expect(block).not.toMatch(/border|padding|background|position|text-align/);
    }
  });

  it('leaves tableStyle absent on a table with none', () => {
    const { tsx, css } = generate(withTableStyle(undefined));
    expect(parseCode(tsx, css).elements['t1']).not.toHaveProperty('tableStyle');
  });

  it('keeps a hand-edited rule verbatim and re-emits it', () => {
    const css = `${BASE_CSS}
:where(.rect_t1) :where(tr) {
  border-bottom: 1px solid #ddd;
  color: red;
}`;
    const parsed = parseCode(TABLE_TSX, css);
    const table = parsed.elements['t1'];
    expect(table?.tableStyle).toBeUndefined();
    expect(table?.customSelectorBlocks).toEqual([
      {
        selector: ':where(.rect_t1) :where(tr)',
        body: '  border-bottom: 1px solid #ddd;\n  color: red;',
      },
    ]);
    const out = generate(parsed.elements);
    expect(out.css).toContain('border-bottom: 1px solid #ddd;\n  color: red;');
  });

  it('applies styling to a table whose columns are not defined', () => {
    // Native table layout honours row borders (the reset collapses
    // them), stripes and cell padding too, so the rules are not gated
    // on the grid.
    const parsed = parseCode(TABLE_TSX, '.rect_t1 {}');
    const table = parsed.elements['t1'];
    if (!table) throw new Error('fixture has no table');
    const { css } = generate({
      ...parsed.elements,
      t1: { ...table, tableStyle: { stripe: '#eee' } },
    });
    expect(css).toContain('background-color: #eee;');
    expect(css).not.toContain('subgrid');
  });
});

describe('mergeTableStyle', () => {
  it('adds a setting to a table with none', () => {
    expect(mergeTableStyle(undefined, { stripe: '#eee' })).toEqual({ stripe: '#eee' });
  });

  it('keeps settings the patch does not mention', () => {
    expect(mergeTableStyle({ stripe: '#eee' }, { stickyHeader: true })).toEqual({
      stripe: '#eee',
      stickyHeader: true,
    });
  });

  it('removes a setting patched to undefined', () => {
    const merged = mergeTableStyle({ stripe: '#eee', cellAlign: 'left' }, { stripe: undefined });
    expect(merged).toEqual({ cellAlign: 'left' });
    expect(merged).not.toHaveProperty('stripe');
  });

  it('returns undefined once the last setting is cleared', () => {
    expect(mergeTableStyle({ stripe: '#eee' }, { stripe: undefined })).toBeUndefined();
  });

  it('returns undefined for an empty patch on an empty style', () => {
    expect(mergeTableStyle(undefined, {})).toBeUndefined();
  });
});
