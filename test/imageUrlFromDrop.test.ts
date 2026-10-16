import { describe, it, expect } from 'vitest';

import { imageUrlFromDrop } from '@lib/imageUrlFromDrop';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('imageUrlFromDrop', () => {
  it('takes the first usable URL in a URI list, skipping comments and blank lines', () => {
    const uriList = ['# a comment', '', 'https://example.com/cat.png', 'https://example.com/dog.png'].join('\r\n');
    expect(imageUrlFromDrop({ uriList, html: '' })).toBe('https://example.com/cat.png');
  });

  it('accepts a data:image URL', () => {
    expect(imageUrlFromDrop({ uriList: PNG, html: '' })).toBe(PNG);
  });

  it('refuses javascript:, file:, and non-image data: URLs, then falls back to the HTML', () => {
    const uriList = ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,<p>hi</p>'].join('\n');
    expect(imageUrlFromDrop({ uriList, html: '' })).toBeNull();
    expect(imageUrlFromDrop({ uriList, html: `<img src="${PNG}">` })).toBe(PNG);
  });

  it('reads the first img src from HTML, in any quoting, with entities decoded', () => {
    expect(imageUrlFromDrop({ uriList: '', html: '<p>x</p><img alt="a" src="https://a.test/1.png?x=1&amp;y=2"><img src="https://a.test/2.png">' })).toBe(
      'https://a.test/1.png?x=1&y=2'
    );
    expect(imageUrlFromDrop({ uriList: '', html: "<img src='https://a.test/q.png'>" })).toBe('https://a.test/q.png');
    expect(imageUrlFromDrop({ uriList: '', html: '<IMG SRC=https://a.test/u.png>' })).toBe('https://a.test/u.png');
  });

  it('prefers the URI list over the HTML', () => {
    expect(imageUrlFromDrop({ uriList: 'https://a.test/list.png', html: '<img src="https://a.test/html.png">' })).toBe('https://a.test/list.png');
  });

  it('returns null for HTML with no img, malformed HTML, and empty input', () => {
    expect(imageUrlFromDrop({ uriList: '', html: '<a href="https://a.test/x.png">link</a>' })).toBeNull();
    expect(imageUrlFromDrop({ uriList: '', html: '<img src=' })).toBeNull();
    expect(imageUrlFromDrop({ uriList: '', html: '' })).toBeNull();
  });
});
