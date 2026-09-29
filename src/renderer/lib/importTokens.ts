import { DEFAULT_RECT_STYLES } from './defaults';
import type { ScampElement } from './element';

/**
 * Lift an imported page's repeated values into design tokens.
 *
 * This is the difference between an import you can work with and a
 * snapshot you can only look at. A page arrives with its brand colour
 * written out forty times as `rgb(45, 74, 124)`; changing it means
 * forty edits, and the theme panel — the thing that makes Scamp a
 * design tool rather than a viewer — has nothing to show.
 *
 * Pure, and deliberately conservative: a value has to earn a token by
 * being used more than once. A one-off colour stays a literal, because
 * a theme full of `--color-11` is worse than no theme.
 *
 * Naming is by ROLE, not by hue. `--color-text` says what it is for;
 * `--color-slate-700` says what it looks like, which stops being true
 * the moment someone changes it. Roles are inferred from where the
 * value is used and how often — the most-used text colour is the text
 * colour — and anything left over is numbered.
 * see docs/plans/website-import-plan.md
 */

export type ExtractedToken = {
  /** Custom property name, `--` included. */
  name: string;
  /** The value, normalised to hex for colours and px for lengths. */
  value: string;
  /** How many declarations referenced it. */
  uses: number;
};

export type TokenExtraction = {
  tokens: ExtractedToken[];
  /** The elements, with every extracted value replaced by `var(--name)`. */
  elements: Record<string, ScampElement>;
};

/** `#hex` (3/4/6/8) or `rgb()/rgba()` to `[r,g,b,a]`; null when neither. */
const toRgba = (color: string): [number, number, number, number] | null => {
  const c = color.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(c);
  if (hex) {
    let h = hex[1] ?? '';
    if (h.length === 3 || h.length === 4) {
      h = h
        .split('')
        .map((ch) => ch + ch)
        .join('');
    }
    if (h.length !== 6 && h.length !== 8) return null;
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    ];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?/.exec(c);
  if (!rgb) return null;
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
};

/**
 * A colour as the panel wants it: `#rrggbb`, or `rgba(...)` kept as-is
 * when it is translucent, since hex-with-alpha is not what the colour
 * control reads.
 */
export const normalizeColor = (color: string): string | null => {
  const rgba = toRgba(color);
  if (rgba === null) return null;
  const [r, g, b, a] = rgba;
  if (a < 1) return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`;
  const hex = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
};

/** Saturation, 0-1. Used only to tell an accent from a neutral. */
const saturationOf = (color: string): number => {
  const rgba = toRgba(color);
  if (rgba === null) return 0;
  const [r, g, b] = rgba;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
};

/** The colour-bearing typed fields, and the role each one suggests. */
const COLOR_FIELDS = [
  { field: 'color', role: 'text' },
  { field: 'backgroundColor', role: 'surface' },
  { field: 'borderColor', role: 'border' },
] as const;

type Usage = { value: string; roles: Map<string, number>; uses: number };

/**
 * Is this colour actually painting anything?
 *
 * The model gives every element a `borderColor` of `#000000` whether or
 * not it has a border, so counting the field blindly reports black as
 * the most popular colour on every page ever imported. A colour counts
 * only when it differs from the field's default AND, for a border,
 * when there is a border for it to be.
 */
const isInEffect = (el: ScampElement, field: (typeof COLOR_FIELDS)[number]['field']): boolean => {
  const value = el[field] as string | undefined;
  if (typeof value !== 'string' || value.length === 0) return false;
  if (value === (DEFAULT_RECT_STYLES as Record<string, unknown>)[field]) return false;
  if (field !== 'borderColor') return true;
  const widths = el.borderWidth;
  const hasWidth =
    Array.isArray(widths) && widths.some((w) => (typeof w === 'number' ? w > 0 : w !== undefined));
  return hasWidth && el.borderStyle !== 'none';
};

const tally = (elements: Record<string, ScampElement>): Map<string, Usage> => {
  const seen = new Map<string, Usage>();
  const record = (raw: string | undefined, role: string): void => {
    if (typeof raw !== 'string' || raw.length === 0) return;
    if (raw === 'transparent' || raw.startsWith('var(')) return;
    const value = normalizeColor(raw);
    if (value === null) return;
    const entry = seen.get(value) ?? { value, roles: new Map(), uses: 0 };
    entry.uses += 1;
    entry.roles.set(role, (entry.roles.get(role) ?? 0) + 1);
    seen.set(value, entry);
  };
  for (const el of Object.values(elements)) {
    for (const { field, role } of COLOR_FIELDS) {
      if (!isInEffect(el, field)) continue;
      record(el[field] as string | undefined, role);
    }
  }
  return seen;
};

/**
 * Give each kept colour a name.
 *
 * The most-used colour in a role takes that role's name; the rest are
 * numbered by how much they are used, so the important ones get the
 * short names. An accent — the most saturated colour that is not
 * already the text or background — is worth naming even when it is used
 * less, because it is the one a person will want to change first.
 */
const nameTokens = (kept: Usage[]): ExtractedToken[] => {
  const byUses = [...kept].sort((a, b) => b.uses - a.uses);
  const taken = new Map<string, Usage>();
  const claim = (name: string, usage: Usage | undefined): void => {
    if (usage === undefined) return;
    if ([...taken.values()].includes(usage)) return;
    if (taken.has(name)) return;
    taken.set(name, usage);
  };

  const topOf = (role: string): Usage | undefined =>
    byUses.find((u) => (u.roles.get(role) ?? 0) === Math.max(...byUses.map((x) => x.roles.get(role) ?? 0)) && (u.roles.get(role) ?? 0) > 0);

  const unclaimed = (): Usage[] => byUses.filter((u) => ![...taken.values()].includes(u));

  // Text first: it is the most reliable signal on any page.
  claim('--color-text', topOf('text'));

  // Then the accent, BEFORE the background role gets to claim a
  // surface. A strongly saturated colour on a couple of elements is a
  // button, not the ground the page sits on — and naming it
  // `--color-background` would be both wrong and the first thing
  // someone tried to change.
  const accent = [...unclaimed()].sort((a, b) => saturationOf(b.value) - saturationOf(a.value))[0];
  if (accent && saturationOf(accent.value) > 0.35) claim('--color-accent', accent);

  claim('--color-background', topOf('surface'));
  claim('--color-border', topOf('border'));

  // Anything still unnamed is a real colour used more than once, and a
  // numbered token still beats forty copies of the same literal.
  let n = 1;
  for (const usage of unclaimed()) {
    claim(`--color-${n}`, usage);
    n += 1;
  }

  return [...taken.entries()].map(([name, usage]) => ({
    name,
    value: usage.value,
    uses: usage.uses,
  }));
};

export type ExtractOptions = {
  /** Uses a value needs before it earns a token. */
  minUses?: number;
  /** Cap, so a photo-heavy page can't write a hundred tokens. */
  maxTokens?: number;
};

/**
 * Extract tokens and rewrite the elements to reference them.
 *
 * Returns the elements unchanged when nothing repeats enough to be
 * worth naming — an import of a two-colour page should not gain a
 * theme it does not need.
 */
export const extractTokens = (
  elements: Record<string, ScampElement>,
  options: ExtractOptions = {}
): TokenExtraction => {
  const minUses = options.minUses ?? 2;
  const maxTokens = options.maxTokens ?? 16;

  const kept = [...tally(elements).values()]
    .filter((u) => u.uses >= minUses)
    .sort((a, b) => b.uses - a.uses)
    .slice(0, maxTokens);
  if (kept.length === 0) return { tokens: [], elements };

  const tokens = nameTokens(kept);
  const byValue = new Map(tokens.map((t) => [t.value, t.name]));

  const next: Record<string, ScampElement> = {};
  for (const [id, el] of Object.entries(elements)) {
    let updated = el;
    for (const { field } of COLOR_FIELDS) {
      if (!isInEffect(updated, field)) continue;
      const raw = updated[field] as string | undefined;
      if (typeof raw !== 'string' || raw.startsWith('var(')) continue;
      const normalized = normalizeColor(raw);
      const name = normalized === null ? undefined : byValue.get(normalized);
      if (name === undefined) continue;
      updated = { ...updated, [field]: `var(${name})` };
    }
    next[id] = updated;
  }

  return { tokens, elements: next };
};

/**
 * Names for extracted tokens that do not collide with a theme's, and do
 * not collide with each other across repeated imports.
 *
 * A name is kept when the theme does not hold it, or holds it with the
 * SAME value — importing one site twice should reference the tokens it
 * made the first time rather than grow a second identical palette.
 *
 * Otherwise it is suffixed. The suffix ESCALATES, and that is the whole
 * point of this function. A single fixed `-imported` is unique against
 * the template's palette and not against itself: import site A and
 * `--color-text` becomes `--color-text-imported`; import site B into the
 * same project and it becomes `--color-text-imported` again, which now
 * exists — so it is filtered out as "already held" and never written,
 * while B's elements have already been pointed at it. B is then painted
 * in A's colours.
 *
 * That is not hypothetical: a project with several sites imported into
 * it had a view referencing `var(--color-text-imported)` 51 times for a
 * near-black text colour, resolving to another site's `#9db0cc`.
 * see docs/notes/import-token-collisions.md
 */
export const resolveTokenNames = (
  tokens: ReadonlyArray<ExtractedToken>,
  existing: ReadonlyMap<string, string>
): ExtractedToken[] => {
  // Names claimed by THIS import, so two extracted tokens cannot land on
  // one name either.
  const claimed = new Map(existing);
  const out: ExtractedToken[] = [];
  for (const token of tokens) {
    const held = claimed.get(token.name);
    if (held === undefined || held === token.value) {
      claimed.set(token.name, token.value);
      out.push(token);
      continue;
    }
    let name = `${token.name}-imported`;
    for (let n = 2; claimed.has(name) && claimed.get(name) !== token.value; n += 1) {
      name = `${token.name}-imported-${n}`;
    }
    claimed.set(name, token.value);
    out.push({ ...token, name });
  }
  return out;
};
