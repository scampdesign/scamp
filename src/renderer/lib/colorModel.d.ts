import type { ThemeToken } from '@shared/types';
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
export declare const buildColorModel: (tokens: ReadonlyArray<ThemeToken>) => ColorModel;
