/** Standard 50–900 shade scale for a generated colour palette. */
export declare const PALETTE_SHADES: readonly [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
export type PaletteShade = {
    shade: number;
    value: string;
};
/**
 * Generate a 10-shade (50–900) palette from a single seed colour using OKLCH.
 *
 * The seed is treated as the **500 anchor**: the 500 shade is the seed's exact
 * value, and the rest of the ramp is the standard lightness scale SHIFTED so it
 * lines up with the seed's lightness. This means re-generating after changing
 * the 500 shifts the whole palette to match the new colour, instead of snapping
 * 500 back to a fixed mid-lightness. Hue is kept from the seed; chroma tapers
 * toward the light/dark ends where high chroma leaves the sRGB gamut. Returns
 * hex values, or `[]` if the seed can't be parsed.
 * see docs/archive/2026-07-23-design-system-plan.md
 */
export declare const generatePalette: (seedHex: string) => PaletteShade[];
