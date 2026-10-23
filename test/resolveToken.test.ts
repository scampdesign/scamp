import { describe, it, expect } from 'vitest';

import { resolveTokenChain, withTokenValues } from '@lib/resolveToken';
import type { ThemeToken } from '@shared/types';

const tokens = (map: Record<string, string>): ThemeToken[] =>
  Object.entries(map).map(([name, value]) => ({ name, value }));

describe('resolveTokenChain', () => {
  it('passes a concrete (non-var) value straight through', () => {
    expect(resolveTokenChain('#3b82f6', [])).toBe('#3b82f6');
    expect(resolveTokenChain('16px', tokens({ '--x': '#000' }))).toBe('16px');
  });

  it('resolves a single-level var reference', () => {
    expect(
      resolveTokenChain('var(--color-blue-500)', tokens({ '--color-blue-500': '#3b82f6' }))
    ).toBe('#3b82f6');
  });

  it('follows a semantic → primitive → hex chain', () => {
    const t = tokens({
      '--color-brand': 'var(--color-brand-500)',
      '--color-brand-500': 'var(--color-blue-500)',
      '--color-blue-500': '#3b82f6',
    });
    expect(resolveTokenChain('var(--color-brand)', t)).toBe('#3b82f6');
  });

  it('returns null for a dangling reference', () => {
    expect(resolveTokenChain('var(--missing)', tokens({ '--x': '#000' }))).toBeNull();
    // ...and mid-chain dangling too.
    expect(
      resolveTokenChain(
        'var(--a)',
        tokens({ '--a': 'var(--b)', '--b': 'var(--gone)' })
      )
    ).toBeNull();
  });

  it('returns null on a reference cycle instead of looping', () => {
    const t = tokens({ '--a': 'var(--b)', '--b': 'var(--a)' });
    expect(resolveTokenChain('var(--a)', t)).toBeNull();
    // Self-reference.
    expect(resolveTokenChain('var(--x)', tokens({ '--x': 'var(--x)' }))).toBeNull();
  });

  it('does not resolve var() with a fallback or inside calc() (passthrough)', () => {
    const t = tokens({ '--x': '#3b82f6' });
    expect(resolveTokenChain('var(--x, #fff)', t)).toBe('var(--x, #fff)');
    expect(resolveTokenChain('calc(var(--x) * 2)', t)).toBe('calc(var(--x) * 2)');
  });

  it('tolerates whitespace inside the var() call', () => {
    expect(
      resolveTokenChain('var( --color-primary )', tokens({ '--color-primary': '#111' }))
    ).toBe('#111');
  });
});

describe('withTokenValues', () => {
  const t = tokens({
    '--space-md': '16px',
    '--color-brand': 'var(--color-blue-500)',
    '--color-blue-500': '#3b82f6',
  });

  it('adds the token and the value it resolves to under the title', () => {
    expect(withTokenValues('Gap', 'var(--space-md)', t)).toBe('Gap\n--space-md: 16px');
  });

  it('resolves an alias to the value at the end of its chain', () => {
    expect(withTokenValues('Fill', 'var(--color-brand)', t)).toBe('Fill\n--color-brand: #3b82f6');
  });

  it('lists each token of a multi-value field once', () => {
    expect(withTokenValues('Padding', 'var(--space-md) 8px var(--space-md) var(--color-brand)', t)).toBe(
      'Padding\n--space-md: 16px\n--color-brand: #3b82f6'
    );
  });

  it('reads a token with a fallback', () => {
    expect(withTokenValues('Gap', 'var(--space-md, 4px)', t)).toBe('Gap\n--space-md: 16px');
  });

  it('says when a token is not defined', () => {
    expect(withTokenValues('Gap', 'var(--space-xl)', t)).toBe('Gap\n--space-xl: not defined');
  });

  it('gives the token line alone when the field has no title', () => {
    expect(withTokenValues(undefined, 'var(--space-md)', t)).toBe('--space-md: 16px');
  });

  it('keeps the title unchanged for a value with no token', () => {
    expect(withTokenValues('Gap', '16px', t)).toBe('Gap');
    expect(withTokenValues('Gap', undefined, t)).toBe('Gap');
    expect(withTokenValues(undefined, '', t)).toBeUndefined();
  });
});
