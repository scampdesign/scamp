import { describe, it, expect } from 'vitest';

import { listNamesAt, parseCallSite } from '@shared/reactSource';

/**
 * Reading a list's names from a React app's `.map()`.
 * see docs/plans/react-import-plan.md
 */

describe('parseCallSite', () => {
  it('splits a call site into path, line and column', () => {
    expect(parseCallSite('/src/features/nav.tsx:102:72')).toEqual({ path: '/src/features/nav.tsx', line: 102, column: 72 });
  });

  it('returns null for anything else', () => {
    expect(parseCallSite('nav.tsx')).toBeNull();
    expect(parseCallSite(':1:2')).toBeNull();
  });
});

describe('listNamesAt', () => {
  const at = (lines: string[], line: number, column: number) => listNamesAt(lines, { path: 'x', line, column });

  it('reads the list and row from a one-line map', () => {
    const line = '        {section.items.map((item) => <NavItem key={item.id} {...item} />)}';
    expect(at([line], 1, line.indexOf('<NavItem') + 1)).toEqual({ over: 'items', as: 'item' });
  });

  it('reads them from a few lines above the JSX', () => {
    const lines = ['  return (', '    <ul>', '      {claims?.map((claim) => (', '        <ClaimRow', '          key={claim.id}'];
    expect(at(lines, 4, 9)).toEqual({ over: 'claims', as: 'claim' });
  });

  it('takes a row without parentheses', () => {
    expect(at(['{rows.map(row => <tr />)}'], 1, 18)).toEqual({ over: 'rows', as: 'row' });
  });

  it('takes the nearest map when there are two', () => {
    const lines = ['{groups.map((group) => (', '  <section>', '    {group.links.map((link) => <a />)}'];
    expect(at(lines, 3, 33)).toEqual({ over: 'links', as: 'link' });
  });

  it('makes a constant’s name a prop name', () => {
    expect(at(['{RECEIVED_RANGES.map((range) => <option />)}'], 1, 34)).toEqual({ over: 'receivedRanges', as: 'range' });
  });

  it('names no row when the callback destructures it', () => {
    expect(at(['{rows.map(({ id, label }) => <li />)}'], 1, 30)).toBeNull();
  });

  it('returns null with no map in sight, or off the end of the file', () => {
    expect(at(['<li />'], 1, 1)).toBeNull();
    expect(at(['x'], 5, 1)).toBeNull();
  });
});
