import { describe, it, expect } from 'vitest';

import { generateCode } from '../src/renderer/lib/generateCode';
import { parseCode } from '../src/renderer/lib/parseCode';

/**
 * Phase 1 of docs/plans/tables-plan.md: the table tags exist and
 * nothing downstream trips on them. No layout work — a ported table
 * keeps its meaning and its content, and looks no worse than the `div`
 * soup it replaces.
 *
 * The parser is htmlparser2 in HTML mode, which carries the spec's
 * implied-end-tag rules — an open `<td>` is closed by the next `<td>`.
 * The generator emits explicit closing tags, so those rules should
 * never fire; that is exactly the kind of "should" worth asserting,
 * because if it is wrong every cell reparents to its sibling and the
 * table comes back flat.
 */

const TABLE_TSX = `<div data-scamp-id="root" className={styles.root}>
      <table data-scamp-id="t100" className={styles.rect_t100}>
        <caption data-scamp-id="t101" className={styles.text_t101}>Patients</caption>
        <thead data-scamp-id="t102" className={styles.rect_t102}>
          <tr data-scamp-id="t103" className={styles.rect_t103}>
            <th data-scamp-id="t104" className={styles.text_t104}>Name</th>
            <th data-scamp-id="t105" className={styles.text_t105}>DOB</th>
          </tr>
        </thead>
        <tbody data-scamp-id="t106" className={styles.rect_t106}>
          <tr data-scamp-id="t107" className={styles.rect_t107}>
            <td data-scamp-id="t108" className={styles.text_t108}>Smith</td>
            <td data-scamp-id="t109" className={styles.text_t109}>1980-04-01</td>
          </tr>
        </tbody>
        <tfoot data-scamp-id="t110" className={styles.rect_t110}>
          <tr data-scamp-id="t111" className={styles.rect_t111}>
            <td data-scamp-id="t112" className={styles.text_t112}>1 patient</td>
          </tr>
        </tfoot>
      </table>
    </div>`;

const TABLE_CSS = `.rect_t100 { background: #ffffff; }
.text_t101 { font-size: 12px; }
.rect_t102 {}
.rect_t103 {}
.text_t104 { font-weight: 600; }
.text_t105 { font-weight: 600; }
.rect_t106 {}
.rect_t107 {}
.text_t108 {}
.text_t109 {}
.rect_t110 {}
.rect_t111 {}
.text_t112 {}`;

describe('the table tags — parsing', () => {
  it('keeps every table tag and the nesting between them', () => {
    const { elements } = parseCode(TABLE_TSX, TABLE_CSS);

    expect(elements['t100']?.tag).toBe('table');
    expect(elements['t101']?.tag).toBe('caption');
    expect(elements['t102']?.tag).toBe('thead');
    expect(elements['t103']?.tag).toBe('tr');
    expect(elements['t104']?.tag).toBe('th');
    expect(elements['t106']?.tag).toBe('tbody');
    expect(elements['t108']?.tag).toBe('td');
    expect(elements['t110']?.tag).toBe('tfoot');

    // The shape, not just the tags. htmlparser2's implied-end-tag
    // rules would show up here as cells reparented to a sibling.
    expect(elements['t100']?.childIds).toEqual(['t101', 't102', 't106', 't110']);
    expect(elements['t102']?.childIds).toEqual(['t103']);
    expect(elements['t103']?.childIds).toEqual(['t104', 't105']);
    expect(elements['t107']?.childIds).toEqual(['t108', 't109']);
    expect(elements['t105']?.parentId).toBe('t103');
    expect(elements['t109']?.parentId).toBe('t107');
  });

  it('honours the className prefix on every cell', () => {
    const { elements } = parseCode(TABLE_TSX, TABLE_CSS);

    // This fixture is in the generator's own format, so the prefix
    // pins each type and the tag name is never consulted. The tag-name
    // fallback — what an imported table actually takes — is the
    // describe block below.
    expect(elements['t104']?.type).toBe('text');
    expect(elements['t104']?.text).toBe('Name');
    expect(elements['t108']?.type).toBe('text');
    expect(elements['t108']?.text).toBe('Smith');
    expect(elements['t101']?.type).toBe('text');
    expect(elements['t101']?.text).toBe('Patients');

    for (const id of ['t100', 't102', 't103', 't106', 't107', 't110']) {
      expect(elements[id]?.type).toBe('rectangle');
    }
  });

  it('upgrades a cell that holds elements to a rectangle so they render', () => {
    // A text-typed element renders only its `.text` and ignores Scamp
    // children, so a `<td>` wrapping a badge would come out blank. The
    // same structural correction `<li>` and `<a>` already get.
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <table data-scamp-id="t200" className={styles.rect_t200}>
        <tr data-scamp-id="t201" className={styles.rect_t201}>
          <td data-scamp-id="t202" className={styles.cell_t202}>
            <span data-scamp-id="t203" className={styles.text_t203}>Active</span>
          </td>
        </tr>
      </table>
    </div>`;
    const css = `.rect_t200 {} .rect_t201 {} .cell_t202 {} .text_t203 {}`;
    const { elements } = parseCode(tsx, css);

    expect(elements['t202']?.tag).toBe('td');
    expect(elements['t202']?.type).toBe('rectangle');
    expect(elements['t202']?.childIds).toEqual(['t203']);
    expect(elements['t203']?.type).toBe('text');
  });

  it('honours a text_ prefix on a cell that holds elements', () => {
    // The prefix is the contract's source of truth, so an explicitly
    // text-typed cell stays text even with children — same exemption
    // every other dual-natured tag gets.
    const tsx = `<div data-scamp-id="root" className={styles.root}>
      <td data-scamp-id="t300" className={styles.text_t300}>
        <span data-scamp-id="t301" className={styles.text_t301}>x</span>
      </td>
    </div>`;
    const css = `.text_t300 {} .text_t301 {}`;
    const { elements } = parseCode(tsx, css);
    expect(elements['t300']?.type).toBe('text');
  });
});

describe('the table tags — a table nobody prefixed', () => {
  // What an import or an agent writes: real class names, no Scamp
  // prefix, so the type comes from the tag name alone. This is the
  // path `TEXT_TAGS` decides, and the prefixed fixture above cannot
  // exercise it.
  const IMPORTED_TSX = `<div data-scamp-id="root" className={styles.root}>
      <table data-scamp-id="i1" className={styles.roster}>
        <caption data-scamp-id="i2" className={styles.rosterTitle}>Patients</caption>
        <thead data-scamp-id="i3" className={styles.rosterHead}>
          <tr data-scamp-id="i4" className={styles.headRow}>
            <th data-scamp-id="i5" className={styles.nameCol}>Name</th>
          </tr>
        </thead>
        <tbody data-scamp-id="i6" className={styles.rosterBody}>
          <tr data-scamp-id="i7" className={styles.bodyRow}>
            <td data-scamp-id="i8" className={styles.nameCell}>Smith</td>
          </tr>
        </tbody>
      </table>
    </div>`;
  const IMPORTED_CSS = `.roster {} .rosterTitle {} .rosterHead {} .headRow {}
.nameCol {} .rosterBody {} .bodyRow {} .nameCell {}`;

  it('types a leaf cell as text from its tag name alone', () => {
    const { elements } = parseCode(IMPORTED_TSX, IMPORTED_CSS);

    // `th`, `td` and `caption` are text tags. Without that, a cell
    // parses as a rectangle, its words are dropped on the floor, and
    // the table arrives structurally intact and completely empty.
    expect(elements['i5']?.type).toBe('text');
    expect(elements['i5']?.text).toBe('Name');
    expect(elements['i8']?.type).toBe('text');
    expect(elements['i8']?.text).toBe('Smith');
    expect(elements['i2']?.type).toBe('text');
    expect(elements['i2']?.text).toBe('Patients');
  });

  it('types the table and its sections as containers', () => {
    const { elements } = parseCode(IMPORTED_TSX, IMPORTED_CSS);
    for (const id of ['i1', 'i3', 'i4', 'i6', 'i7']) {
      expect(elements[id]?.type).toBe('rectangle');
    }
  });

  it('round-trips an unprefixed table unchanged', () => {
    const first = parseCode(IMPORTED_TSX, IMPORTED_CSS);
    const generated = generateCode({
      elements: first.elements,
      rootId: first.rootId,
      pageName: 'patients',
    });
    const second = parseCode(generated.tsx, generated.css);
    expect(second.elements).toEqual(first.elements);
  });
});

describe('the table tags — round-trip', () => {
  it('round-trips a table tree through generate → parse unchanged', () => {
    const first = parseCode(TABLE_TSX, TABLE_CSS);
    const generated = generateCode({
      elements: first.elements,
      rootId: first.rootId,
      pageName: 'patients',
    });
    const second = parseCode(generated.tsx, generated.css);

    expect(second.elements).toEqual(first.elements);
    expect(second.rootId).toBe(first.rootId);
  });

  it('is text-stable: a second generate produces the same bytes', () => {
    // The invariant that matters on disk. A tag the generator emits but
    // the parser reads back differently shows up as a file that dirties
    // itself on every save.
    const first = parseCode(TABLE_TSX, TABLE_CSS);
    const genA = generateCode({
      elements: first.elements,
      rootId: first.rootId,
      pageName: 'patients',
    });
    const second = parseCode(genA.tsx, genA.css);
    const genB = generateCode({
      elements: second.elements,
      rootId: second.rootId,
      pageName: 'patients',
    });

    expect(genB.tsx).toBe(genA.tsx);
    expect(genB.css).toBe(genA.css);
  });

  it('emits real table tags, not divs', () => {
    const first = parseCode(TABLE_TSX, TABLE_CSS);
    const { tsx } = generateCode({
      elements: first.elements,
      rootId: first.rootId,
      pageName: 'patients',
    });

    for (const tag of ['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption']) {
      expect(tsx).toContain(`<${tag} data-scamp-id=`);
    }
  });
});
