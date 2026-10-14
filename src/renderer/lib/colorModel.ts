import type { ThemeToken } from '@shared/types';

import { resolveTokenChain } from './resolveToken';

const COLOR_PREFIX = '--color-';
// A primitive token ends in a numeric shade: `brand-500`, `neutral-0`.
const SHADE_RE = /^(.+)-(\d+)$/;

export type PaletteShadeToken = {
  /** Numeric shade, e.g. 500. */
  shade: number;
  /** Full token name, e.g. `--color-brand-500`. */
  name: string;
  /** Raw value (hex, or a `var(...)` reference). */
  value: string;
};

export type PrimitivePalette = {
  /** Palette name, e.g. `brand`. */
  name: string;
  shades: PaletteShadeToken[];
};

export type SemanticColorToken = {
  /** Full token name, e.g. `--color-background`. */
  name: string;
  /** Raw value — usually a `var(--color-...)` reference. */
  value: string;
  /** Fully-resolved concrete value (following the chain), or null if broken. */
  resolved: string | null;
};

export type ColorModel = {
  palettes: PrimitivePalette[];
  semantic: SemanticColorToken[];
};

/**
 * Group the flat theme tokens into the Colors view: primitive palettes
 * (`--color-<palette>-<shade>`) and semantic tokens (`--color-<name>`, which
 * usually reference a primitive). This is a derived VIEW over the flat token
 * list — the flat list stays authoritative; edits mutate it and reserialize.
 * see docs/archive/2026-07-23-design-system-plan.md
 */
export const buildColorModel = (
  tokens: ReadonlyArray<ThemeToken>
): ColorModel => {
  const paletteMap = new Map<string, PrimitivePalette>();
  const semantic: SemanticColorToken[] = [];

  for (const t of tokens) {
    if (!t.name.startsWith(COLOR_PREFIX)) continue;
    const suffix = t.name.slice(COLOR_PREFIX.length);
    const m = suffix.match(SHADE_RE);
    const paletteName = m?.[1];
    const shadeStr = m?.[2];
    if (paletteName !== undefined && shadeStr !== undefined) {
      const shade = Number(shadeStr);
      const existing = paletteMap.get(paletteName);
      const palette = existing ?? { name: paletteName, shades: [] };
      if (!existing) paletteMap.set(paletteName, palette);
      palette.shades.push({ shade, name: t.name, value: t.value });
    } else {
      semantic.push({
        name: t.name,
        value: t.value,
        resolved: resolveTokenChain(t.value, tokens),
      });
    }
  }

  const palettes = [...paletteMap.values()].map((p) => ({
    ...p,
    shades: [...p.shades].sort((a, b) => a.shade - b.shade),
  }));
  return { palettes, semantic };
};
