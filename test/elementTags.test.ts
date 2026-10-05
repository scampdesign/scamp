import { describe, it, expect } from 'vitest';

import { TAG_OPTIONS } from '../src/renderer/lib/elementTags';
import { parseCode } from '../src/renderer/lib/parseCode';

/**
 * The tag picker and the parser have to agree. `TAG_OPTIONS` says which
 * tags a user may choose for an element of each type; `parseCode` reads
 * the file back and decides the type again from the tag. Offering a tag
 * under `text` that the parser classifies as a rectangle produces an
 * element that changes type the next time the file is read — the text
 * disappears from the canvas and the properties panel swaps sections
 * under the user.
 *
 * The className prefix is the contract's real source of truth, so this
 * uses an UNPREFIXED class to isolate the tag-name fallback. That is
 * the path a hand-written or agent-written file takes.
 */

/** Tags whose content is an attribute or a child list, not words. */
const NOT_TEXT_CARRYING = new Set(['img', 'input', 'textarea', 'select', 'svg']);

describe('TAG_OPTIONS agrees with the parser', () => {
  it('classifies every tag offered for a text element as text', () => {
    const failures: string[] = [];
    for (const option of TAG_OPTIONS.text) {
      if (NOT_TEXT_CARRYING.has(option.value)) continue;
      const tsx = `<div data-scamp-id="root" className={styles.root}>
        <${option.value} data-scamp-id="e1" className={styles.plain}>words</${option.value}>
      </div>`;
      const { elements } = parseCode(tsx, `.plain {}`);
      const type = elements['e1']?.type;
      if (type !== 'text') failures.push(`${option.value} → ${String(type)}`);
    }
    expect(failures).toEqual([]);
  });

  it('keeps the tag the picker offered', () => {
    // A tag the parser silently rewrites would make the picker lie
    // about what it just did.
    //
    // `tag` is absent when it equals the type's default — the parser
    // omits it deliberately so a plain `<div>` round-trips without
    // growing a redundant field. So the comparison is against the
    // effective tag, not the stored one.
    const DEFAULT_TAG: Readonly<Record<string, string>> = {
      rectangle: 'div',
      text: 'p',
      image: 'img',
      input: 'input',
    };
    const failures: string[] = [];
    for (const [type, options] of Object.entries(TAG_OPTIONS)) {
      for (const option of options) {
        const tsx = `<div data-scamp-id="root" className={styles.root}>
          <${option.value} data-scamp-id="e1" className={styles.plain}></${option.value}>
        </div>`;
        const { elements } = parseCode(tsx, `.plain {}`);
        const element = elements['e1'];
        const effective = element?.tag ?? DEFAULT_TAG[element?.type ?? ''];
        if (effective !== option.value) {
          failures.push(`${type}/${option.value} → ${String(effective)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('offers the whole table family', () => {
    const rectangle = TAG_OPTIONS.rectangle.map((o) => o.value);
    const text = TAG_OPTIONS.text.map((o) => o.value);

    // Containers: the table, its sections, and the row.
    for (const tag of ['table', 'thead', 'tbody', 'tfoot', 'tr']) {
      expect(rectangle).toContain(tag);
    }
    // Cells are dual-natured like `li`, so they appear in both lists.
    for (const tag of ['th', 'td']) {
      expect(rectangle).toContain(tag);
      expect(text).toContain(tag);
    }
    // A caption only ever holds words.
    expect(text).toContain('caption');
    expect(rectangle).not.toContain('caption');
  });

  it('lists each tag once per element type', () => {
    for (const [type, options] of Object.entries(TAG_OPTIONS)) {
      const values = options.map((o) => o.value);
      expect(new Set(values).size, `duplicate tag in ${type}`).toBe(values.length);
    }
  });
});
