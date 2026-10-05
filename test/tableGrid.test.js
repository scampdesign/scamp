import { describe, it, expect } from 'vitest';
import { generateCode } from '../src/renderer/lib/generateCode';
import { parseCode } from '../src/renderer/lib/parseCode';
import { isGridTable, tableSubgridRule } from '../src/renderer/lib/tableGrid';
/**
 * Phase 2 of docs/plans/tables-plan.md: the columns are defined once,
 * on the table, and reach every row through `subgrid`.
 *
 * The rule is derived from the table's own state rather than stored on
 * each row, so the thing to guard is that deriving it twice gives the
 * same bytes and that reading it back does not accumulate a copy.
 */
/** A table with three columns, a header row and two body rows. */
const TABLE_TSX = `<div data-scamp-id="root" className={styles.root}>
      <table data-scamp-id="t1" className={styles.rect_t1}>
        <thead data-scamp-id="t2" className={styles.rect_t2}>
          <tr data-scamp-id="t3" className={styles.rect_t3}>
            <th data-scamp-id="t4" className={styles.text_t4}>Name</th>
            <th data-scamp-id="t5" className={styles.text_t5}>DOB</th>
            <th data-scamp-id="t6" className={styles.text_t6}>Status</th>
          </tr>
        </thead>
        <tbody data-scamp-id="t7" className={styles.rect_t7}>
          <tr data-scamp-id="t8" className={styles.rect_t8}>
            <td data-scamp-id="t9" className={styles.text_t9}>Smith</td>
            <td data-scamp-id="t10" className={styles.text_t10}>1980-04-01</td>
            <td data-scamp-id="t11" className={styles.text_t11}>Active</td>
          </tr>
        </tbody>
      </table>
    </div>`;
const gridTableCss = (tracks) => `.rect_t1 {
  display: grid;
  grid-template-columns: ${tracks};
}
.rect_t2 {} .rect_t3 {} .text_t4 {} .text_t5 {} .text_t6 {}
.rect_t7 {} .rect_t8 {} .text_t9 {} .text_t10 {} .text_t11 {}`;
/** The declarations inside one class's own rule. */
const blockOf = (css, cls) => new RegExp(`\\.${cls} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
const generateFrom = (tsx, css) => {
    const parsed = parseCode(tsx, css);
    return generateCode({
        elements: parsed.elements,
        rootId: parsed.rootId,
        pageName: 'patients',
    });
};
describe('isGridTable', () => {
    const base = parseCode(TABLE_TSX, gridTableCss('2fr 120px 100px'));
    it('is true for a table with a display and tracks', () => {
        const table = base.elements['t1'];
        expect(table).toBeDefined();
        if (!table)
            return;
        expect(isGridTable(table)).toBe(true);
    });
    it('is false for a table with no column tracks', () => {
        // `display: grid` with no tracks gives one implicit column and
        // stacks every cell in it — worse than the browser's table layout,
        // which an undefined table should keep.
        const parsed = parseCode(TABLE_TSX, `.rect_t1 { display: grid; }`);
        const table = parsed.elements['t1'];
        expect(table).toBeDefined();
        if (!table)
            return;
        expect(table.display).toBe('grid');
        expect(isGridTable(table)).toBe(false);
    });
    it('is false for a table that is not a grid', () => {
        const parsed = parseCode(TABLE_TSX, `.rect_t1 { grid-template-columns: 2fr 1fr; }`);
        const table = parsed.elements['t1'];
        expect(table).toBeDefined();
        if (!table)
            return;
        expect(isGridTable(table)).toBe(false);
    });
    it('is false for a grid that is not a table', () => {
        const tsx = `<div data-scamp-id="root" className={styles.root}>
      <section data-scamp-id="g1" className={styles.rect_g1} />
    </div>`;
        const parsed = parseCode(tsx, `.rect_g1 { display: grid; grid-template-columns: 1fr 1fr; }`);
        const grid = parsed.elements['g1'];
        expect(grid).toBeDefined();
        if (!grid)
            return;
        expect(isGridTable(grid)).toBe(false);
    });
});
describe('the derived subgrid rule', () => {
    it('matches the section children by tag, not by their Scamp class', () => {
        // An exported page is read by the HTML parser, which wraps a bare
        // `<tr>` in a `<tbody>` of its own. That element has no Scamp
        // class, so a per-class rule misses it and the chain is cut — in
        // the exported page only, while the canvas renders it correctly.
        const rule = tableSubgridRule('rect_t1');
        expect(rule).toContain(':where(thead, tbody, tfoot)');
        expect(rule).toContain(':where(tr)');
        expect(rule).toContain('grid-template-columns: subgrid;');
        expect(rule).toContain('grid-column: 1 / -1;');
    });
    it('has zero specificity so a row can still override it', () => {
        // Every compound is inside `:where()`. A bare `.rect_t1 > tbody`
        // would be (0,1,1) and would beat the row's own (0,1,0) rule.
        const rule = tableSubgridRule('rect_t1');
        const selector = rule.slice(0, rule.indexOf('{'));
        expect(selector).not.toMatch(/(^|[\s>,])\.rect_t1/);
    });
    it('is emitted for a grid table and reaches both surfaces', () => {
        const { css } = generateFrom(TABLE_TSX, gridTableCss('2fr 120px 100px'));
        expect(css).toContain(tableSubgridRule('rect_t1'));
        // The column definition appears exactly once in the file. That is
        // the whole point: a hand-built table repeats it per row.
        expect(css.match(/grid-template-columns: 2fr 120px 100px/g)).toHaveLength(1);
    });
    it('is not emitted for a table with no columns defined', () => {
        const { css } = generateFrom(TABLE_TSX, `.rect_t1 {}`);
        expect(css).not.toContain('subgrid');
    });
    it('writes no per-row width, so there is nothing to keep in step', () => {
        const { css } = generateFrom(TABLE_TSX, gridTableCss('2fr 120px 100px'));
        // Neither the rows nor the cells carry a width of their own.
        for (const cls of ['rect_t3', 'rect_t8', 'text_t4', 'text_t9']) {
            const block = new RegExp(`\\.${cls} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
            expect(block).not.toContain('width');
            expect(block).not.toContain('flex-basis');
        }
    });
});
describe('the derived rule round-trips', () => {
    it('does not accumulate a stored copy when read back', () => {
        const first = generateFrom(TABLE_TSX, gridTableCss('2fr 120px 100px'));
        const reparsed = parseCode(first.tsx, first.css);
        const second = generateCode({
            elements: reparsed.elements,
            rootId: reparsed.rootId,
            pageName: 'patients',
        });
        // Exactly one subgrid rule after a full generate → parse → generate.
        // A derived rule the parser stored as an authored one would come
        // back twice, and grow by one on every save.
        expect(second.css.match(/grid-template-columns: subgrid/g)).toHaveLength(1);
        expect(second.css).toBe(first.css);
        expect(second.tsx).toBe(first.tsx);
    });
    it('keeps the element tree identical across the round-trip', () => {
        const parsed = parseCode(TABLE_TSX, gridTableCss('2fr 120px 100px'));
        const generated = generateCode({
            elements: parsed.elements,
            rootId: parsed.rootId,
            pageName: 'patients',
        });
        const again = parseCode(generated.tsx, generated.css);
        expect(again.elements).toEqual(parsed.elements);
    });
    it('stores nothing about subgrid on the rows themselves', () => {
        const first = generateFrom(TABLE_TSX, gridTableCss('2fr 120px 100px'));
        const reparsed = parseCode(first.tsx, first.css);
        for (const id of ['t2', 't3', 't7', 't8']) {
            const row = reparsed.elements[id];
            expect(row).toBeDefined();
            if (!row)
                continue;
            // The row is a plain container in the model. The subgrid is the
            // table's statement about it, not the row's own state.
            expect(row.gridTemplateColumns).toBe('');
            expect(row.gridColumn).toBe('');
            expect(row.customSelectorBlocks ?? []).toEqual([]);
        }
    });
    it('follows the table when its columns change', () => {
        const { css } = generateFrom(TABLE_TSX, gridTableCss('1fr 1fr'));
        expect(css).toContain('grid-template-columns: 1fr 1fr;');
        expect(css).toContain('grid-template-columns: subgrid;');
        // Changing a column is one edit in one place.
        expect(css.match(/grid-template-columns: 1fr 1fr/g)).toHaveLength(1);
    });
});
describe('a cell that spans columns', () => {
    const spanTsx = (attrs) => `<div data-scamp-id="root" className={styles.root}>
      <table data-scamp-id="t1" className={styles.rect_t1}>
        <tbody data-scamp-id="t2" className={styles.rect_t2}>
          <tr data-scamp-id="t3" className={styles.rect_t3}>
            <td data-scamp-id="t4" className={styles.text_t4} ${attrs}>Total</td>
          </tr>
        </tbody>
      </table>
    </div>`;
    const spanCss = `.rect_t1 { display: grid; grid-template-columns: 2fr 120px 100px; }
.rect_t2 {} .rect_t3 {} .text_t4 {}`;
    it('turns colSpan into a grid-column span', () => {
        const { css } = generateFrom(spanTsx('colSpan="2"'), spanCss);
        expect(css).toContain('grid-column: span 2;');
    });
    it('turns rowSpan into a grid-row span', () => {
        const { css } = generateFrom(spanTsx('rowSpan="3"'), spanCss);
        expect(css).toContain('grid-row: span 3;');
    });
    it('stores the span once, on the attribute', () => {
        const first = generateFrom(spanTsx('colSpan="2"'), spanCss);
        const reparsed = parseCode(first.tsx, first.css);
        const cell = reparsed.elements['t4'];
        expect(cell).toBeDefined();
        if (!cell)
            return;
        // The attribute is the record; `gridColumn` stays empty so the two
        // cannot disagree when the attribute changes.
        expect(cell.attributes?.['colSpan']).toBe('2');
        expect(cell.gridColumn).toBe('');
    });
    it('round-trips a spanning cell byte-for-byte', () => {
        const first = generateFrom(spanTsx('colSpan="2" rowSpan="2"'), spanCss);
        const reparsed = parseCode(first.tsx, first.css);
        const second = generateCode({
            elements: reparsed.elements,
            rootId: reparsed.rootId,
            pageName: 'patients',
        });
        expect(second.css).toBe(first.css);
        expect(second.tsx).toBe(first.tsx);
        expect(second.css.match(/grid-column: span 2/g)).toHaveLength(1);
    });
    it('lets an explicit placement win over the attribute', () => {
        // A user who typed a placement meant it; the derivation only fills
        // in what the attribute already said.
        const css = `${spanCss}
.text_t4 { grid-column: 2 / 4; }`;
        const generated = generateFrom(spanTsx('colSpan="2"'), css);
        expect(blockOf(generated.css, 'text_t4')).toContain('grid-column: 2 / 4;');
        expect(generated.css).not.toContain('grid-column: span 2;');
    });
    it('ignores a span of one and a malformed one', () => {
        // `span 1` is already the default, and a malformed attribute is
        // better left alone than turned into a placement nobody asked for.
        for (const attrs of ['colSpan="1"', 'colSpan="0"', 'colSpan="two"', 'colSpan=""']) {
            const { css } = generateFrom(spanTsx(attrs), spanCss);
            expect(blockOf(css, 'text_t4'), attrs).not.toContain('grid-column');
        }
    });
    it('ignores a span on something that is not a cell', () => {
        const tsx = `<div data-scamp-id="root" className={styles.root}>
      <section data-scamp-id="g1" className={styles.rect_g1}>
        <div data-scamp-id="g2" className={styles.rect_g2} colSpan="2" />
      </section>
    </div>`;
        const { css } = generateFrom(tsx, `.rect_g1 { display: grid; grid-template-columns: 1fr 1fr; }
.rect_g2 {}`);
        expect(blockOf(css, 'rect_g2')).not.toContain('grid-column');
        // And no subgrid rule, because a section is not a table.
        expect(css).not.toContain('subgrid');
    });
});
