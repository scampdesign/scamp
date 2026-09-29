import { describe, it, expect } from 'vitest';

import {
  needsFileTreatment,
  svgAssetName,
  svgDocument,
} from '@lib/importSvgAssets';

/**
 * Saving an imported SVG as a file rather than inlining its markup.
 *
 * The failure this exists for is silent: an HTML parser lowercases
 * `stopColor` to `stopcolor`, a gradient's stops lose their colours, and
 * the icon renders black with nothing anywhere saying why.
 * see docs/notes/import-svg-as-file.md
 */

describe('needsFileTreatment', () => {
  it.each([
    ['<defs><linearGradient id="g"/></defs><path/>', 'a gradient'],
    ['<filter id="f"><feBlur/></filter>', 'a filter'],
    ['<mask id="m"><rect/></mask>', 'a mask'],
    ['<clipPath id="c"><rect/></clipPath>', 'a clip path'],
    ['<pattern id="p"><rect/></pattern>', 'a pattern'],
    ['<use href="#x"/>', 'a use reference'],
    ['<style>.a{fill:red}</style>', 'an embedded stylesheet'],
  ])('sends %s to a file', (source) => {
    expect(needsFileTreatment(source)).toBe(true);
  });

  it.each([
    '<path d="M0 0h24v24H0z"/>',
    '<circle cx="12" cy="12" r="10"/>',
    '<g fill="currentColor"><path d="M1 1"/></g>',
  ])('leaves a plain icon inline: %s', (source) => {
    // Deliberate. An `<img>` cannot inherit `currentColor`, so turning
    // every icon into a file would freeze the ones that follow the text
    // colour around them.
    expect(needsFileTreatment(source)).toBe(false);
  });

  it('matches whatever case the page wrote', () => {
    expect(needsFileTreatment('<LINEARGRADIENT id="g"/>')).toBe(true);
    expect(needsFileTreatment('<clippath id="c"/>')).toBe(true);
  });
});

describe('svgDocument', () => {
  it('always writes an xmlns, which an inline svg can omit', () => {
    // An inline `<svg>` in an HTML page renders without it. The same
    // markup in a .svg FILE does not render at all.
    const doc = svgDocument({ viewBox: '0 0 24 24' }, '<path d="M0 0"/>');
    expect(doc).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('does not write xmlns twice when the capture already had one', () => {
    const doc = svgDocument(
      { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24' },
      '<path/>'
    );
    expect(doc.match(/xmlns=/g)).toHaveLength(1);
  });

  it('carries the attributes that decide how it draws', () => {
    const doc = svgDocument(
      { viewBox: '46 7 110 23', fill: 'none', 'stroke-width': '2' },
      '<path/>'
    );
    expect(doc).toContain('viewBox="46 7 110 23"');
    expect(doc).toContain('fill="none"');
    expect(doc).toContain('stroke-width="2"');
  });

  it('keeps the inner markup exactly as the page wrote it', () => {
    // The whole point: no JSX spelling, no case folding. `stop-color`
    // stays `stop-color`, which is what makes the gradient render.
    const inner =
      '<defs><linearGradient id="g"><stop stop-color="#0ACD95"/></linearGradient></defs>';
    expect(svgDocument({}, inner)).toContain(inner);
  });

  it('escapes a quote in an attribute rather than breaking the document', () => {
    const doc = svgDocument({ viewBox: 'a"b' }, '<path/>');
    expect(doc).toContain('viewBox="a&quot;b"');
  });

  it('skips an attribute the capture did not have', () => {
    expect(svgDocument({ viewBox: '0 0 1 1' }, '<path/>')).not.toContain('stroke=');
  });
});

describe('svgAssetName', () => {
  it('prefers the title, which is the only human name an icon has', () => {
    expect(svgAssetName('<title>GainWix</title><path/>', 'icon_0005')).toBe('gainwix');
  });

  it('falls back to the element name when there is no title', () => {
    expect(svgAssetName('<path/>', 'nav_logo')).toBe('nav_logo');
  });

  it('makes a name safe for a file system', () => {
    expect(svgAssetName('<title>Arrow / Right (big)</title>', 'x')).toBe('arrow-right-big');
  });

  it('never returns an empty name', () => {
    // A title of only punctuation cleans to nothing, and a file still
    // needs to be called something.
    expect(svgAssetName('<title>!!!</title>', '***')).toBe('icon');
  });

  it('caps a very long title', () => {
    const long = 'a'.repeat(120);
    expect(svgAssetName(`<title>${long}</title>`, 'x').length).toBeLessThanOrEqual(40);
  });
});
