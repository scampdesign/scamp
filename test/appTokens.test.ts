import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';

import { CAPTURE_VERSION, type CapturedNode, type CapturePayload } from '@shared/importCapture';
import { themeClassFor, themeFromTokens, tokenizeCapture } from '@lib/appTokens';
import { generateCode } from '@lib/generateCode';
import { reduceCapture } from '@lib/importReduce';
import { parseThemeFile, serializeThemeFile } from '@lib/parseTheme';

/**
 * A React app's own tokens, carried into an import.
 * see docs/plans/react-import-plan.md
 */

const node = (over: Partial<CapturedNode> = {}): CapturedNode => ({
  id: 0,
  tag: 'div',
  styles: {},
  text: null,
  attrs: {},
  children: [],
  notes: [],
  ...over,
});

const payloadOf = (root: CapturedNode, tokens: CapturePayload['tokens']): CapturePayload => ({
  version: CAPTURE_VERSION,
  url: 'fixture:tokens',
  title: 'Tokens',
  viewport: { width: 1440, height: 900 },
  root,
  assets: [],
  notes: [],
  ...(tokens !== undefined ? { tokens } : {}),
});

const TOKENS = {
  values: { '--surface': '#eef3f9', '--ink': '#1d2732', '--space-4': '16px' },
  active: 'light',
  themes: { dark: { '--surface': '#16181c', '--ink': '#f3f3f7', '--space-4': '16px' } },
};

const sidebar = (): CapturePayload =>
  payloadOf(
    node({
      children: [
        node({
          id: 1,
          tag: 'nav',
          styles: { 'background-color': 'rgb(238, 243, 249)', color: 'rgb(29, 39, 50)', 'padding-top': '16px', 'border-top-color': 'red' },
          tokens: { 'background-color': '--surface', color: '--ink', 'padding-top': '--space-4', 'margin-top': '--space-4' },
        }),
      ],
    }),
    TOKENS
  );

describe('tokenizeCapture', () => {
  it('writes each property the app tokenised as its token', () => {
    const nav = tokenizeCapture(sidebar()).root.children[0]!;
    expect(nav.styles).toEqual({
      'background-color': 'var(--surface)',
      color: 'var(--ink)',
      'padding-top': 'var(--space-4)',
      // The app wrote this one as a literal, so it stays one.
      'border-top-color': 'red',
    });
  });

  it('keeps the literal where the panel can’t read a token, so it stays editable', () => {
    const payload = payloadOf(
      node({ children: [node({ id: 1, tag: 'strong', text: 'x', styles: { 'font-weight': '700' }, tokens: { 'font-weight': '--weight-bold' } })] }),
      { values: { '--weight-bold': '700' }, active: null, themes: {} }
    );
    expect(tokenizeCapture(payload).root.children[0]!.styles['font-weight']).toBe('700');
  });

  it('adds nothing the capture left out as its initial value', () => {
    expect(tokenizeCapture(sidebar()).root.children[0]!.styles['margin-top']).toBeUndefined();
  });

  it('keeps the literal for a token it is told to skip', () => {
    const nav = tokenizeCapture(sidebar(), new Set(['--ink'])).root.children[0]!;
    expect(nav.styles['color']).toBe('rgb(29, 39, 50)');
  });

  it('leaves a capture with no tokens exactly as it was', () => {
    const plain = payloadOf(node({ children: [node({ id: 1, styles: { color: 'red' } })] }), undefined);
    expect(tokenizeCapture(plain).root).toBe(plain.root);
  });

  it('carries the reference through the reducer into the generated CSS', () => {
    const reduced = reduceCapture(tokenizeCapture(sidebar()));
    const { css } = generateCode({ elements: reduced.elements, rootId: reduced.rootId, pageName: 'P', cssModuleImportName: 'P', isComponent: true });
    expect(css).toContain('var(--surface)');
    expect(css).toContain('var(--ink)');
    expect(css).toContain('var(--space-4)');
  });
});

describe('themeFromTokens', () => {
  it('adds the app’s tokens, and its dark theme as a .dark block of what differs', () => {
    const merged = themeFromTokens(TOKENS, { tokens: [], themes: [], fontImportUrls: [] });
    expect(merged.added).toEqual(['--surface', '--ink', '--space-4']);
    expect(merged.theme.tokens).toEqual([
      { name: '--surface', value: '#eef3f9' },
      { name: '--ink', value: '#1d2732' },
      { name: '--space-4', value: '16px' },
    ]);
    expect(merged.theme.themes).toEqual([
      { cssClass: 'dark', tokens: [{ name: '--surface', value: '#16181c' }, { name: '--ink', value: '#f3f3f7' }] },
    ]);
  });

  it('reuses a token the project has with the same value, and reports one it has with another', () => {
    const existing = parseThemeFile(':root {\n  --ink: #1d2732;\n  --surface: #ffffff;\n}\n');
    const merged = themeFromTokens(TOKENS, existing);
    expect(merged.added).toEqual(['--space-4']);
    expect(merged.conflicts).toEqual(['--surface']);
    expect(merged.theme.tokens.find((t) => t.name === '--surface')?.value).toBe('#ffffff');
  });

  it('writes a theme file the parser reads back the same', () => {
    const merged = themeFromTokens(TOKENS, { tokens: [], themes: [], fontImportUrls: [] });
    const reread = parseThemeFile(serializeThemeFile(merged.theme, ''));
    expect(reread.tokens).toEqual(merged.theme.tokens);
    expect(reread.themes).toEqual(merged.theme.themes);
  });
});

describe('themeClassFor', () => {
  it('maps dark to Scamp’s dark theme, and any other name to a theme class', () => {
    expect(themeClassFor('dark')).toBe('dark');
    expect(themeClassFor('High Contrast')).toBe('theme-high-contrast');
    expect(themeClassFor('!!')).toBe('theme-alt');
  });
});

describe('against a page captured from a real browser', () => {
  // test/fixtures/import/pages/tokens.html — the cascade cases the
  // capture's token reader has to get right.
  const payload = JSON.parse(readFileSync('test/fixtures/import/payloads/tokens.json', 'utf-8')) as CapturePayload;
  const all: CapturedNode[] = [];
  const walk = (n: CapturedNode): void => {
    all.push(n);
    n.children.forEach(walk);
  };
  walk(payload.root);
  const sections = all.filter((n) => n.tag === 'section');

  it('reads a token out of a shorthand, and leaves the literal sides literal', () => {
    expect(sections[0]?.tokens).toMatchObject({ 'padding-top': '--space', 'padding-bottom': '--space' });
    expect(sections[0]?.tokens?.['padding-left']).toBeUndefined();
  });

  it('lets a more specific literal beat the token', () => {
    expect(sections[0]?.tokens?.['background-color']).toBe('--surface');
    expect(sections[1]?.tokens?.['background-color']).toBeUndefined();
  });

  it('lets !important beat specificity, and reads an inline style', () => {
    expect(all.find((n) => n.tag === 'span')?.tokens).toEqual({ color: '--accent' });
    expect(all.find((n) => n.tokens?.['border-top-color'] !== undefined)?.tokens?.['border-left-color']).toBe('--accent');
  });

  it('reads each token’s value in every theme the page declares', () => {
    expect(payload.tokens?.active).toBe('light');
    expect(payload.tokens?.values['--surface']).toBe('#eef3f9');
    expect(payload.tokens?.themes['dark']?.['--surface']).toBe('#16181c');
  });

  it('turns into a theme with a dark block of only what differs', () => {
    const merged = themeFromTokens(payload.tokens!, { tokens: [], themes: [], fontImportUrls: [] });
    expect(merged.theme.themes?.[0]).toEqual({
      cssClass: 'dark',
      tokens: [
        { name: '--surface', value: '#16181c' },
        { name: '--ink', value: '#f3f3f7' },
      ],
    });
  });
});
