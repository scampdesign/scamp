import { describe, it, expect } from 'vitest';

import { CAPTURE_VERSION, type CapturedNode } from '@shared/importCapture';
import { generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { reduceCapture } from '@lib/importReduce';
import { buildReport } from '@lib/importReport';
import { planTable } from '@lib/importTable';
import { isGridTable } from '@lib/tableGrid';

/**
 * Phase 4 of docs/archive/2026-10-05-tables-plan.md: an imported table arrives as a
 * Scamp grid table — columns once, on the table — rather than as flex
 * columns that stack every cell.
 */

let nextNodeId = 100;
const n = (over: Partial<CapturedNode> & Pick<CapturedNode, 'tag'>): CapturedNode => {
  nextNodeId += 1;
  return {
    id: nextNodeId,
    styles: {},
    text: null,
    attrs: {},
    children: [],
    notes: [],
    ...over,
  };
};

/** A measured cell starting at `x`, `w` wide, on the row at `y`. */
const cell = (
  tag: 'th' | 'td',
  text: string,
  x: number,
  w: number,
  y: number,
  attrs: Record<string, string> = {}
): CapturedNode =>
  n({ tag, text, attrs, styles: { display: 'table-cell' }, rect: { x, y, w, h: 30 } });

/**
 * The patient list from the reviewed project, as a browser lays it out:
 * a 600px table, columns of 380 / 120 / 100, header in a `thead`.
 */
const patientTable = (): CapturedNode => {
  const row = (y: number, tag: 'th' | 'td', words: [string, string, string]): CapturedNode =>
    n({
      tag: 'tr',
      styles: { display: 'table-row' },
      rect: { x: 0, y, w: 600, h: 30 },
      children: [
        cell(tag, words[0], 0, 380, y),
        cell(tag, words[1], 380, 120, y),
        cell(tag, words[2], 500, 100, y),
      ],
    });
  return n({
    tag: 'table',
    styles: { display: 'table', width: '600px' },
    rect: { x: 0, y: 0, w: 600, h: 90 },
    children: [
      n({
        tag: 'thead',
        styles: { display: 'table-header-group' },
        rect: { x: 0, y: 0, w: 600, h: 30 },
        children: [row(0, 'th', ['Name', 'DOB', 'Status'])],
      }),
      n({
        tag: 'tbody',
        styles: { display: 'table-row-group' },
        rect: { x: 0, y: 30, w: 600, h: 60 },
        children: [
          row(30, 'td', ['Smith', '1980-04-01', 'Active']),
          row(60, 'td', ['Jones', '1975-11-12', 'Away']),
        ],
      }),
    ],
  });
};

const reduceTable = (table: CapturedNode): ReturnType<typeof reduceCapture> => {
  let id = 0;
  return reduceCapture(
    {
      version: CAPTURE_VERSION,
      url: 'fixture:table',
      title: 'Patients',
      viewport: { width: 1440, height: 900 },
      root: n({ tag: 'body', rect: { x: 0, y: 0, w: 1440, h: 900 }, children: [table] }),
      assets: [],
      notes: [],
    },
    {
      randomId: () => {
        id += 1;
        return id.toString(16).padStart(4, '0');
      },
    }
  );
};

describe('planTable', () => {
  it('reads one column per cell edge', () => {
    const result = planTable(patientTable());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.columns).toEqual([380, 120, 100]);
  });

  it('gives every structural node a role and leaves cell contents alone', () => {
    const inner = n({ tag: 'span', text: 'x' });
    const table = n({
      tag: 'table',
      children: [
        n({ tag: 'caption', text: 'Patients' }),
        n({
          tag: 'tr',
          children: [n({ tag: 'td', rect: { x: 0, y: 0, w: 50, h: 10 }, children: [inner] })],
        }),
      ],
    });
    const result = planTable(table);
    if (!result.ok) throw new Error(result.reason);
    const roles = [...result.plan.roles.values()].sort();
    expect(roles).toEqual(['caption', 'cell', 'row', 'table']);
    expect(result.plan.roles.has(inner.id)).toBe(false);
  });

  it('measures edges, not widths, so a collapsed border is not counted twice', () => {
    // Each cell reports the half of the shared 2px border it owns, so
    // widths sum past the table. Edges do not.
    const table = n({
      tag: 'table',
      children: [
        n({
          tag: 'tr',
          children: [cell('td', 'a', 0, 101, 0), cell('td', 'b', 100, 101, 0)],
        }),
      ],
    });
    const result = planTable(table);
    if (!result.ok) throw new Error(result.reason);
    expect(result.plan.columns).toEqual([100, 101]);
  });

  it('finds every column edge when one row spans columns', () => {
    const table = n({
      tag: 'table',
      children: [
        n({ tag: 'tr', children: [cell('td', 'wide', 0, 300, 0, { colspan: '2' })] }),
        n({ tag: 'tr', children: [cell('td', 'a', 0, 200, 30), cell('td', 'b', 200, 100, 30)] }),
      ],
    });
    const result = planTable(table);
    if (!result.ok) throw new Error(result.reason);
    expect(result.plan.columns).toEqual([200, 100]);
  });

  it('treats a malformed colspan as 1', () => {
    const table = n({
      tag: 'table',
      children: [
        n({
          tag: 'tr',
          children: [cell('td', 'a', 0, 50, 0, { colspan: 'two' }), cell('td', 'b', 50, 50, 0)],
        }),
      ],
    });
    const result = planTable(table);
    if (!result.ok) throw new Error(result.reason);
    expect(result.plan.columns).toEqual([50, 50]);
  });

  it('refuses a cell that spans rows', () => {
    const table = n({
      tag: 'table',
      children: [n({ tag: 'tr', children: [cell('td', 'a', 0, 50, 0, { rowspan: '2' })] })],
    });
    expect(planTable(table)).toEqual({ ok: false, reason: 'a cell spans rows' });
  });

  it('refuses a table with no rows', () => {
    expect(planTable(n({ tag: 'table' }))).toEqual({ ok: false, reason: 'no rows' });
  });

  it('refuses something other than a row part directly inside the table', () => {
    const table = n({ tag: 'table', children: [n({ tag: 'div' })] });
    expect(planTable(table)).toEqual({
      ok: false,
      reason: 'a <div> directly inside the table',
    });
  });

  it('refuses something other than a cell inside a row', () => {
    const table = n({ tag: 'table', children: [n({ tag: 'tr', children: [n({ tag: 'div' })] })] });
    expect(planTable(table)).toEqual({ ok: false, reason: 'a <div> inside a row' });
  });

  it('refuses a column whose edge was never measured', () => {
    const table = n({
      tag: 'table',
      children: [n({ tag: 'tr', children: [n({ tag: 'td', text: 'no rect' })] })],
    });
    expect(planTable(table)).toEqual({ ok: false, reason: 'column 1 has no measured edge' });
  });

  it('marks column groups so the reducer can drop them', () => {
    const col = n({ tag: 'col' });
    const table = n({
      tag: 'table',
      children: [
        n({ tag: 'colgroup', children: [col] }),
        n({ tag: 'tr', children: [cell('td', 'a', 0, 50, 0)] }),
      ],
    });
    const result = planTable(table);
    if (!result.ok) throw new Error(result.reason);
    expect(result.plan.roles.get(col.id)).toBe('column');
  });
});

describe('importing a table', () => {
  it('makes the table a grid carrying the measured columns', () => {
    const { elements } = reduceTable(patientTable());
    const table = Object.values(elements).find((el) => el.tag === 'table');
    expect(table).toBeDefined();
    if (!table) return;
    expect(isGridTable(table)).toBe(true);
    // 380 + 120 + 100 fills the 600px table, so the proportions are
    // the decision and come back as fractions.
    expect(table.gridTemplateColumns).toBe('3.8fr 1.2fr 1fr');
  });

  it('writes the columns once, not once per row', () => {
    const { elements } = reduceTable(patientTable());
    const { css } = generateCode({ elements, rootId: 'root', pageName: 'patients' });
    expect(css.match(/grid-template-columns: [^s]/g)).toHaveLength(1);
    expect(css).toContain('grid-template-columns: subgrid;');
  });

  it('gives no row, section or cell a display, a width or a position', () => {
    const { elements } = reduceTable(patientTable());
    const parts = Object.values(elements).filter((el) =>
      ['thead', 'tbody', 'tr', 'th', 'td'].includes(el.tag ?? '')
    );
    // Two sections, three rows, nine cells.
    expect(parts).toHaveLength(14);
    for (const part of parts) {
      expect(part.display).toBe('none');
      expect(part.widthMode).toBe('auto');
      expect(part.position).toBe('auto');
      expect(part.customProperties).not.toHaveProperty('display');
    }
    const { css } = generateCode({ elements, rootId: 'root', pageName: 'patients' });
    expect(css).not.toMatch(/table-(cell|row)/);
    // Nothing is taken out of flow: the body is a flex column, and
    // every table part counts as laying its children out.
    expect(css).not.toContain('position: absolute');
  });

  it('keeps the cell text', () => {
    const { elements } = reduceTable(patientTable());
    const texts = Object.values(elements)
      .filter((el) => el.tag === 'td')
      .map((el) => el.text);
    expect(texts).toContain('Smith');
    expect(texts).toContain('Away');
  });

  it('carries a colspan through to the cell, which then spans in the grid', () => {
    const table = n({
      tag: 'table',
      styles: { display: 'table' },
      rect: { x: 0, y: 0, w: 300, h: 60 },
      children: [
        n({ tag: 'tr', children: [cell('td', 'wide', 0, 300, 0, { colspan: '2' })] }),
        n({ tag: 'tr', children: [cell('td', 'a', 0, 200, 30), cell('td', 'b', 200, 100, 30)] }),
      ],
    });
    const { elements } = reduceTable(table);
    const wide = Object.values(elements).find((el) => el.text === 'wide');
    expect(wide?.attributes).toEqual({ colSpan: '2' });
    const { css } = generateCode({ elements, rootId: 'root', pageName: 'patients' });
    expect(css).toContain('grid-column: span 2;');
  });

  it('drops column groups, whose widths the grid already carries', () => {
    const table = patientTable();
    table.children.unshift(n({ tag: 'colgroup', children: [n({ tag: 'col' })] }));
    const { elements } = reduceTable(table);
    const tags = Object.values(elements).map((el) => el.tag);
    expect(tags).not.toContain('colgroup');
    expect(tags).not.toContain('col');
  });

  it('round-trips through the files', () => {
    // Component mode, as the import tests do: a page root gains the
    // page default on the way back, which is not the table's doing.
    const { elements, rootId } = reduceTable(patientTable());
    const opts = { pageName: 'P', cssModuleImportName: 'P', isComponent: true };
    const first = generateCode({ elements, rootId, ...opts });
    const parsed = parseCode(first.tsx, first.css);
    const second = generateCode({ elements: parsed.elements, rootId, ...opts });
    expect(second.tsx).toBe(first.tsx);
    expect(second.css.replace('  min-height: 100vh;\n', '')).toBe(
      first.css.replace('  min-height: 100vh;\n', '')
    );
  });

  it('is graded approximated, not lost', () => {
    const { findings } = reduceTable(patientTable());
    expect(findings.filter((f) => f.kind === 'table-to-grid')).toEqual([
      expect.objectContaining({ kind: 'table-to-grid', detail: '3 columns' }),
    ]);
    expect(findings.map((f) => f.kind)).not.toContain('unsupported-display');
    // The page body still becomes a flex column; nothing in the table does.
    expect(
      findings.filter((f) => f.kind === 'block-to-flex' && (f.at ?? '').includes('table'))
    ).toEqual([]);
    const report = buildReport(findings);
    expect(report.find((group) => group.kind === 'table-to-grid')?.fidelity).toBe(
      'approximated'
    );
  });

  it('still reports a table it cannot rebuild, and says why', () => {
    const table = n({
      tag: 'table',
      styles: { display: 'table' },
      children: [n({ tag: 'tr', children: [cell('td', 'a', 0, 50, 0, { rowspan: '2' })] })],
    });
    const { findings, elements } = reduceTable(table);
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: 'unsupported-display', detail: 'table: a cell spans rows' })
    );
    const imported = Object.values(elements).find((el) => el.tag === 'table');
    expect(imported?.display).not.toBe('grid');
  });

  it('leaves a table restyled as something else alone', () => {
    // `display: block` on a table means the page does not want table
    // layout, so neither the grid nor the finding apply.
    const table = patientTable();
    table.styles = { display: 'block' };
    const { findings } = reduceTable(table);
    expect(findings.map((f) => f.kind)).not.toContain('table-to-grid');
  });
});

describe('a positioned part of an imported table', () => {
  it('keeps a cell the page positioned absolutely', () => {
    // A row places its cells, so an absolute cell is a choice the page
    // made rather than Scamp's default — the same reading parseCode
    // gives it on reload.
    const table = patientTable();
    const firstCell = table.children[0]?.children[0]?.children[0];
    if (!firstCell) throw new Error('fixture has no cell');
    firstCell.styles = { ...firstCell.styles, position: 'absolute', left: '0px', top: '0px' };
    const { elements } = reduceTable(table);
    expect(Object.values(elements).find((el) => el.text === 'Name')?.position).toBe('absolute');
  });
});
