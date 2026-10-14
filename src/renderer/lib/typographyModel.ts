import type { ThemeToken } from '@shared/types';

/**
 * A semantic text style is a group of tokens sharing a `--text-<name>-`
 * prefix: family / size / weight / leading / (optional) tracking. It maps
 * to a heading or body role (H1, Body, Label, …) and is applied to an
 * element as a set via the WYSIWYG "Text style" dropdown.
 * see docs/archive/2026-07-23-design-system-plan.md
 */
export type TextStyleProp =
  | 'family'
  | 'size'
  | 'weight'
  | 'leading'
  | 'tracking';

export const TEXT_STYLE_PROPS: ReadonlyArray<TextStyleProp> = [
  'family',
  'size',
  'weight',
  'leading',
  'tracking',
];

export type TextStyle = {
  /** Token slug, e.g. `h1`, `body-large`. */
  name: string;
  /** Display label, e.g. `H1`, `Body Large`. */
  label: string;
  /** Raw token value per prop, or null when that token isn't defined. */
  family: string | null;
  size: string | null;
  weight: string | null;
  leading: string | null;
  tracking: string | null;
};

// `--text-<name>-<prop>` — the `<name>` is greedy so multi-word slugs
// (`body-large`) resolve correctly. Bare scale tokens like `--text-xs`
// (no known prop suffix) are NOT text-style tokens.
const TEXT_STYLE_RE =
  /^--text-(.+)-(family|size|weight|leading|tracking)$/;

/** True when a token belongs to a text-style group (vs a bare scale step). */
export const isTextStyleToken = (name: string): boolean =>
  TEXT_STYLE_RE.test(name);

/** The token name for one prop of a text style. */
export const textStyleTokenName = (
  name: string,
  prop: TextStyleProp
): string => `--text-${name}-${prop}`;

/** Title-case a slug into a label: `body-large` → `Body Large`. */
export const textStyleLabel = (name: string): string =>
  name
    .split('-')
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/**
 * Group the flat token list into text styles, in first-seen order. Only
 * `--text-<name>-<prop>` tokens participate; each style carries the raw
 * value for every prop it defines (null otherwise).
 */
export const buildTextStyles = (
  tokens: ReadonlyArray<ThemeToken>
): TextStyle[] => {
  const byName = new Map<string, Partial<Record<TextStyleProp, string>>>();
  const order: string[] = [];
  const bucket = (name: string): Partial<Record<TextStyleProp, string>> => {
    const existing = byName.get(name);
    if (existing) return existing;
    const fresh: Partial<Record<TextStyleProp, string>> = {};
    byName.set(name, fresh);
    order.push(name);
    return fresh;
  };
  for (const t of tokens) {
    const m = t.name.match(TEXT_STYLE_RE);
    if (!m || m[1] === undefined || m[2] === undefined) continue;
    bucket(m[1])[m[2] as TextStyleProp] = t.value;
  }
  return order.map((name) => {
    const props = byName.get(name) ?? {};
    return {
      name,
      label: textStyleLabel(name),
      family: props.family ?? null,
      size: props.size ?? null,
      weight: props.weight ?? null,
      leading: props.leading ?? null,
      tracking: props.tracking ?? null,
    };
  });
};

/** A default text-style template (PRD "Default semantic text styles"). */
type TextStyleTemplate = {
  name: string;
  size: string;
  weight: string;
  leading: string;
  /** Family token reference; defaults to `var(--font-sans)`. */
  family?: string;
};

export const DEFAULT_TEXT_STYLE_TEMPLATES: ReadonlyArray<TextStyleTemplate> = [
  { name: 'display', size: '3.5rem', weight: '800', leading: '1.1' },
  { name: 'h1', size: '2.5rem', weight: '700', leading: '1.2' },
  { name: 'h2', size: '2rem', weight: '700', leading: '1.25' },
  { name: 'h3', size: '1.5rem', weight: '600', leading: '1.3' },
  { name: 'h4', size: '1.25rem', weight: '600', leading: '1.35' },
  { name: 'body-large', size: '1.125rem', weight: '400', leading: '1.6' },
  { name: 'body', size: '1rem', weight: '400', leading: '1.5' },
  { name: 'body-small', size: '0.875rem', weight: '400', leading: '1.5' },
  { name: 'label', size: '0.75rem', weight: '500', leading: '1.4' },
  { name: 'code', size: '0.875rem', weight: '400', leading: '1.6', family: 'var(--font-mono)' },
];

/** Emit the `--text-<name>-<prop>` tokens for one template. */
export const textStyleTokensFromTemplate = (
  t: TextStyleTemplate
): ThemeToken[] => [
  { name: textStyleTokenName(t.name, 'family'), value: t.family ?? 'var(--font-sans)' },
  { name: textStyleTokenName(t.name, 'size'), value: t.size },
  { name: textStyleTokenName(t.name, 'weight'), value: t.weight },
  { name: textStyleTokenName(t.name, 'leading'), value: t.leading },
];

/** The full default text-style token set (all templates flattened). */
export const defaultTextStyleTokens = (): ThemeToken[] =>
  DEFAULT_TEXT_STYLE_TEMPLATES.flatMap(textStyleTokensFromTemplate);
