import { describe, it, expect } from 'vitest';

import { jsxAttributeName, jsxStyleObject, svgSourceToJsx, svgSourceToHtml } from '@lib/svgJsx';

/**
 * Captured SVG markup, made safe for the `.tsx` file it is written into.
 * see docs/notes/import-svg-jsx.md
 */

describe('jsxAttributeName', () => {
  it.each([
    ['fill-rule', 'fillRule'],
    ['stop-color', 'stopColor'],
    ['stroke-width', 'strokeWidth'],
    ['stroke-linecap', 'strokeLinecap'],
    ['clip-path', 'clipPath'],
  ])('camel-cases %s', (input, want) => {
    expect(jsxAttributeName(input)).toBe(want);
  });

  it('keeps data- and aria- hyphenated, the way React does', () => {
    expect(jsxAttributeName('data-scamp-id')).toBe('data-scamp-id');
    expect(jsxAttributeName('aria-hidden')).toBe('aria-hidden');
  });

  it('knows the names React spells differently for other reasons', () => {
    expect(jsxAttributeName('datetime')).toBe('dateTime');
    expect(jsxAttributeName('viewBox')).toBe('viewBox');
    expect(jsxAttributeName('class')).toBe('className');
  });

  it('spells a namespaced attribute the way React wants it', () => {
    expect(jsxAttributeName('xlink:href')).toBe('xlinkHref');
  });

  it('leaves a plain name alone', () => {
    expect(jsxAttributeName('d')).toBe('d');
    expect(jsxAttributeName('fill')).toBe('fill');
  });
});

describe('jsxStyleObject', () => {
  it('turns a declaration string into an object literal', () => {
    expect(jsxStyleObject('fill: none; stroke-width: 1.6')).toBe(
      "{{ fill: 'none', strokeWidth: '1.6' }}"
    );
  });

  it('keeps a custom property under its own name', () => {
    expect(jsxStyleObject('--ring: red')).toBe("{{ '--ring': 'red' }}");
  });

  it('survives a trailing semicolon and empty segments', () => {
    expect(jsxStyleObject('fill: red;;')).toBe("{{ fill: 'red' }}");
  });

  it('escapes a quote in the value rather than breaking the literal', () => {
    expect(jsxStyleObject(`font-family: 'My Font'`)).toContain("\\'My Font\\'");
  });

  it('returns an empty object for nothing usable', () => {
    expect(jsxStyleObject('   ')).toBe('{{  }}');
  });
});

describe('svgSourceToJsx', () => {
  it('converts the style string React refuses', () => {
    // The icons rendered black because of exactly this: the colour was
    // captured, then dropped by the renderer.
    const out = svgSourceToJsx('<path style="fill: currentcolor; opacity: 0.16;"></path>');
    expect(out).toBe("<path style={{ fill: 'currentcolor', opacity: '0.16' }}></path>");
  });

  it('converts presentation attributes', () => {
    const out = svgSourceToJsx('<stop offset="0" stop-color="#fff"></stop>');
    expect(out).toBe('<stop offset="0" stopColor="#fff"></stop>');
  });

  it('leaves the path data alone', () => {
    const d = 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z';
    expect(svgSourceToJsx(`<path d="${d}"></path>`)).toContain(d);
  });

  it('leaves closing tags and text alone', () => {
    expect(svgSourceToJsx('<title>Home</title>')).toBe('<title>Home</title>');
  });

  it('is idempotent, because the source is converted again on every save', () => {
    const once = svgSourceToJsx('<path style="fill: none" stroke-width="2"/>');
    expect(svgSourceToJsx(once)).toBe(once);
  });

  it('does not touch an attribute that is already a JSX expression', () => {
    const src = '<path style={{ fill: \'red\' }} d="M0 0"/>';
    expect(svgSourceToJsx(src)).toBe(src);
  });

  it('handles a whole gradient definition', () => {
    const out = svgSourceToJsx(
      '<defs><linearGradient id="g" x1="0"><stop stop-color="red" stop-opacity="0.5"></stop></linearGradient></defs>'
    );
    expect(out).toContain('stopColor="red"');
    expect(out).toContain('stopOpacity="0.5"');
    expect(out).toContain('id="g"');
  });

  it('returns an empty string unchanged', () => {
    expect(svgSourceToJsx('')).toBe('');
  });
});

describe('svgSourceToHtml', () => {
  /**
   * The inverse. `svgSource` is JSX because it is emitted into a `.tsx`
   * file, and two consumers are not React — the canvas injects it as
   * HTML, and `buildHtmlExport` writes it into an HTML document.
   *
   * Three bugs came from that one gap: `stopColor` read as `stopcolor`,
   * camelCase tag names, and `style={{…}}` read as an attribute whose
   * value is `{{` — which turned every line icon into a solid black
   * blob. see docs/notes/import-parity-log.md
   */
  it('turns a style object back into a style attribute', () => {
    expect(
      svgSourceToHtml(`<path style={{ fill: 'none', strokeWidth: '1.6' }} />`)
    ).toBe('<path style="fill: none; stroke-width: 1.6" />');
  });

  it('un-camel-cases an attribute name', () => {
    expect(svgSourceToHtml('<path strokeWidth="2" />')).toBe('<path stroke-width="2" />');
    expect(svgSourceToHtml('<stop stopColor="#0ACD95" />')).toBe(
      '<stop stop-color="#0ACD95" />'
    );
  });

  it('keeps an attribute that is the same in both', () => {
    expect(svgSourceToHtml('<path d="M0 0h24" fill="none" />')).toBe(
      '<path d="M0 0h24" fill="none" />'
    );
  });

  it('keeps viewBox, which HTML parses case-insensitively anyway', () => {
    // `viewbox` is what an HTML parser lowercases it to, and SVG's own
    // fix-up table restores it. Either spelling renders.
    expect(svgSourceToHtml('<svg viewBox="0 0 24 24" />')).toContain('0 0 24 24');
  });

  it('leaves data- and aria- alone', () => {
    expect(svgSourceToHtml('<path data-x="1" aria-hidden="true" />')).toBe(
      '<path data-x="1" aria-hidden="true" />'
    );
  });

  it('is idempotent, like its inverse', () => {
    // The canvas converts on every render; converting twice must not
    // change anything.
    const once = svgSourceToHtml(`<path style={{ fill: 'none' }} strokeWidth="2" />`);
    expect(svgSourceToHtml(once)).toBe(once);
  });

  it('round-trips the line icon that started this', () => {
    const html = '<path d="M6 11.5a6 6 0 0 0 12 0" fill="none" stroke="currentColor" stroke-width="1.6"></path>';
    expect(svgSourceToHtml(svgSourceToJsx(html))).toBe(html);
  });

  it('drops an empty style rather than leaving a broken attribute', () => {
    expect(svgSourceToHtml('<path style={{  }} />')).toBe('<path  />');
  });

  it('keeps a custom property name intact', () => {
    expect(svgSourceToHtml(`<path style={{ '--x': 'red' }} />`)).toBe(
      '<path style="--x: red" />'
    );
  });
});
