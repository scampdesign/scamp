// @lib/appTokens.ts — a React app's own design tokens, carried into the import.
//
// The capture records, element by element, where the page's cascade
// settled on exactly `var(--name)` (`CapturedNode.tokens`), and each such
// token's value in every theme the page declares (`CapturePayload.tokens`).
// This puts those references back where the app had them, and the tokens
// into the project's theme. A colour the app wrote as a literal stays a
// literal: nothing here infers a token from a matching value, which is
// what made the importer's old token extraction a theme nobody chose.
// see docs/plans/react-import-plan.md, docs/notes/import-token-collisions.md
//
// Pure.

import type { CapturedNode, CapturedTokens, CapturePayload } from '@shared/importCapture';
import type { ThemeToken } from '@shared/types';

import { cssToScampProperty, isMappedProperty } from './cssPropertyMap';
import type { ParsedTheme, ThemeBlock } from './parseTheme';

/** The project's theme with the app's tokens in it, and what didn't fit. */
export type AppThemeMerge = {
  theme: ParsedTheme;
  /** Tokens added to the project. */
  added: string[];
  /** Tokens the project already has with another value; their uses stay literal. */
  conflicts: string[];
};

/** A Scamp theme class for an app's theme name: `dark`, or `theme-<slug>`. */
export const themeClassFor = (name: string): string => {
  if (name === 'dark') return 'dark';
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `theme-${slug.length > 0 ? slug : 'alt'}`;
};

/**
 * Merge the app's tokens into the project's theme. The theme the page was
 * showing becomes the base (`:root`); each other theme becomes a block,
 * holding only what differs from the base. A token the project already
 * declares with the same value is simply reused.
 */
export const themeFromTokens = (captured: CapturedTokens, existing: ParsedTheme): AppThemeMerge => {
  const known = new Map(existing.tokens.map((t) => [t.name, t.value]));
  const added: string[] = [];
  const conflicts: string[] = [];
  const tokens: ThemeToken[] = [...existing.tokens];
  for (const [name, value] of Object.entries(captured.values)) {
    const had = known.get(name);
    if (had === undefined) {
      tokens.push({ name, value });
      added.push(name);
    } else if (had.trim() !== value.trim()) {
      conflicts.push(name);
    }
  }
  const usable = new Set([...added, ...Object.keys(captured.values).filter((n) => !conflicts.includes(n))]);

  const themes: ThemeBlock[] = (existing.themes ?? []).map((b) => ({ ...b, tokens: [...b.tokens] }));
  for (const [themeName, values] of Object.entries(captured.themes)) {
    const cssClass = themeClassFor(themeName);
    const differs = Object.entries(values).filter(
      ([name, value]) => added.includes(name) && usable.has(name) && captured.values[name] !== value
    );
    if (differs.length === 0) continue;
    let block = themes.find((b) => b.cssClass === cssClass);
    if (block === undefined) {
      block = { cssClass, tokens: [] };
      themes.push(block);
    }
    for (const [name, value] of differs) {
      if (!block.tokens.some((t) => t.name === name)) block.tokens.push({ name, value });
    }
  }

  return { theme: { ...existing, tokens, themes }, added, conflicts };
};

/**
 * Whether the properties panel can hold a token here. One it has a control
 * for but can't read a reference in — `font-weight: var(--weight-bold)` —
 * keeps its literal, which the panel can edit: a token nobody can change
 * from the panel is worth less than a value someone can. A side longhand
 * (`padding-top`) isn't mapped itself; it folds into a shorthand that is.
 */
const panelHoldsToken = (prop: string, name: string): boolean => {
  if (!isMappedProperty(prop)) return true;
  const mapper = cssToScampProperty[prop];
  return mapper !== undefined && mapper(`var(${name})`) !== null;
};

/**
 * The capture with each tokenised property written as `var(--name)`, so
 * the reducer carries the reference into the element. Only properties the
 * capture kept (that differ from their initial value), only tokens the
 * page gave a value for, and none in `skip` — a token the project
 * already holds with another value keeps its literal.
 */
export const tokenizeCapture = (payload: CapturePayload, skip: ReadonlySet<string> = new Set()): CapturePayload => {
  const palette = payload.tokens?.values ?? {};
  const walk = (node: CapturedNode): CapturedNode => {
    let styles = node.styles;
    for (const [prop, name] of Object.entries(node.tokens ?? {})) {
      if (!(prop in styles) || skip.has(name) || palette[name] === undefined || !panelHoldsToken(prop, name)) continue;
      if (styles === node.styles) styles = { ...node.styles };
      styles[prop] = `var(${name})`;
    }
    const children = node.children.map(walk);
    return styles === node.styles && children.every((c, i) => c === node.children[i]) ? node : { ...node, styles, children };
  };
  return { ...payload, root: walk(payload.root) };
};
