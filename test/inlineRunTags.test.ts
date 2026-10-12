import { describe, it, expect } from 'vitest';

import { generateCode } from '@lib/generateCode';
import { generateHtml } from '@lib/generateHtml';
import { parseCode } from '@lib/parseCode';
import { applyStyleToRange, mergeRuns, runFromMarkup, splitAt, type TextRun } from '@lib/textRuns';

/**
 * Inline tags inside a sentence. `Hello <em>world</em> again` used to be
 * saved as `Hello  again <em>world</em>`: the markup was kept, but placed
 * after all of the element's words. It is now a run, in its place.
 * see docs/notes/inline-run-tags.md
 */

const page = (inner: string): string =>
  `<div data-scamp-id="root" className={styles.root}>\n  <p data-scamp-id="aaaa" className={styles.text_aaaa}>${inner}</p>\n</div>`;

const CSS = `.text_aaaa {\n  font-size: 16px;\n}\n.text_aaaa__r1 {\n  color: red;\n}\n`;

/** The paragraph's JSX after one save, on one line. */
const saved = (inner: string, css = CSS): { p: string; stable: boolean } => {
  const parsed = parseCode(page(inner), css);
  const once = generateCode({ elements: parsed.elements, rootId: parsed.rootId, pageName: 'P' });
  const reparsed = parseCode(once.tsx, once.css);
  const twice = generateCode({ elements: reparsed.elements, rootId: reparsed.rootId, pageName: 'P' });
  const p = (once.tsx.match(/<p[\s\S]*?<\/p>/) ?? [''])[0].replace(/\n\s*/g, ' ');
  return { p, stable: twice.tsx === once.tsx && twice.css === once.css };
};

describe('inline tags in a sentence', () => {
  it('keeps <em> where it is, with the spaces around it', () => {
    const { p, stable } = saved('Hello <em>world</em> again');
    expect(p).toContain(`Hello{' '}<em>world</em>{' '}again`);
    expect(stable).toBe(true);
  });

  it('keeps several inline tags in order', () => {
    const { p } = saved('An <strong>important</strong> and <code>exact</code> <i>point</i>.');
    expect(p).toContain(`An{' '}<strong>important</strong>{' '}and{' '}<code>exact</code>{' '}<i>point</i>.`);
  });

  it('reads a plain inline tag as a tagged run', () => {
    const { elements } = parseCode(page('Hello <em>world</em> again'), CSS);
    expect(elements['aaaa']?.runs).toEqual([{ text: 'Hello ' }, { text: 'world', tag: 'em' }, { text: ' again' }]);
    expect(elements['aaaa']?.text).toBe('Hello world again');
    expect(elements['aaaa']?.inlineFragments).toEqual([]);
  });

  it('keeps markup it can’t model verbatim, in its place', () => {
    const { p, stable } = saved('Read <a href="/docs">the <b>docs</b></a> first.');
    expect(p).toContain(`Read{' '}<a href="/docs">the <b>docs</b></a>{' '}first.`);
    expect(stable).toBe(true);
  });

  it('keeps an inline tag holding a binding as markup, not as words', () => {
    const { elements } = parseCode(page('Hi <em>{name}</em>'), CSS);
    expect(elements['aaaa']?.runs?.[1]).toMatchObject({ markup: '<em>{name}</em>' });
    expect(saved('Hi <em>{name}</em>').p).toContain('<em>{name}</em>');
  });

  it('reads a styled inline tag as a tagged run with its style', () => {
    const { elements } = parseCode(page('A <em className={styles.text_aaaa__r1}>red</em> word'), CSS);
    expect(elements['aaaa']?.runs?.[1]).toEqual({ text: 'red', tag: 'em', style: { color: 'red' } });
    expect(saved('A <em className={styles.text_aaaa__r1}>red</em> word').p).toContain(
      `A{' '}<em className={styles.text_aaaa__r1}>red</em>{' '}word`
    );
  });

  it('round-trips words around an entity as one run', () => {
    const { p, stable } = saved('Ann &amp; <em>Bob &amp; Co</em> end');
    expect(p).toContain(`<em>Bob & Co</em>`);
    expect(stable).toBe(true);
  });

  it('leaves plain text and styling spans as they were', () => {
    expect(saved('Just words').p).toContain('>Just words</p>');
    expect(saved('A <span className={styles.text_aaaa__r1}>red</span> word').p).toContain(
      `A{' '}<span className={styles.text_aaaa__r1}>red</span>{' '}word`
    );
  });

  it('round-trips the model: generate then parse gives the same runs', () => {
    const { elements, rootId } = parseCode(page('One <em>two</em> <strong>three</strong>'), CSS);
    const out = generateCode({ elements, rootId, pageName: 'P' });
    expect(parseCode(out.tsx, out.css).elements['aaaa']?.runs).toEqual(elements['aaaa']?.runs);
  });
});

describe('runFromMarkup', () => {
  it('makes a tagged run of an inline tag holding only words', () => {
    expect(runFromMarkup('<strong>a &amp; b</strong>')).toEqual({ text: 'a & b', tag: 'strong' });
    expect(runFromMarkup(`<em>a{' '}b</em>`)).toEqual({ text: 'a b', tag: 'em' });
  });

  it('keeps anything else verbatim, with its words as the text', () => {
    expect(runFromMarkup('<a href="/x">go</a>')).toEqual({ text: 'go', markup: '<a href="/x">go</a>' });
    expect(runFromMarkup('<em>a <b>b</b></em>')).toEqual({ text: 'a b', markup: '<em>a <b>b</b></em>' });
    expect(runFromMarkup('<div>block</div>')).toMatchObject({ markup: '<div>block</div>' });
  });
});

describe('editing runs that carry a tag or markup', () => {
  const runs: TextRun[] = [{ text: 'Hello ' }, { text: 'world', tag: 'em' }, { text: ' ' }, { text: 'docs', markup: '<a href="/d">docs</a>' }];

  it('keeps the tag when part of a tagged run is styled', () => {
    const out = applyStyleToRange(runs, 6, 9, { color: 'red' });
    expect(out).toContainEqual({ text: 'wor', tag: 'em', style: { color: 'red' } });
    expect(out).toContainEqual({ text: 'ld', tag: 'em' });
  });

  it('never cuts or styles markup', () => {
    expect(splitAt(runs, 14)).toEqual(runs);
    expect(applyStyleToRange(runs, 12, 16, { color: 'red' })).toContainEqual(runs[3]);
  });

  it('doesn’t merge runs with different tags', () => {
    expect(mergeRuns([{ text: 'a' }, { text: 'b', tag: 'em' }])).toHaveLength(2);
    expect(mergeRuns([{ text: 'a', tag: 'em' }, { text: 'b', tag: 'em' }])).toEqual([{ text: 'ab', tag: 'em' }]);
  });
});

describe('the HTML export', () => {
  it('writes runs in order, with their tags', () => {
    const { elements, rootId } = parseCode(page('Hello <em>world</em> and <a href="/d">docs</a>'), CSS);
    const html = generateHtml(elements, rootId, { componentTrees: {} });
    expect(html).toContain('Hello <em>world</em> and <a href="/d">docs</a>');
  });
});
