import { clampChroma, formatHex, oklch } from 'culori';
/** Standard 50–900 shade scale for a generated colour palette. */
export const PALETTE_SHADES = [
    50, 100, 200, 300, 400, 500, 600, 700, 800, 900,
];
// Target OKLCH lightness per shade — a perceptually even light→dark ramp.
const SHADE_LIGHTNESS = {
    50: 0.971,
    100: 0.936,
    200: 0.885,
    300: 0.808,
    400: 0.704,
    500: 0.606,
    600: 0.518,
    700: 0.442,
    800: 0.371,
    900: 0.298,
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
export const generatePalette = (seedHex) => {
    const seed = oklch(seedHex);
    if (!seed)
        return [];
    const h = seed.h ?? 0;
    const c = seed.c ?? 0;
    const anchor = SHADE_LIGHTNESS[500] ?? 0.606;
    // Shift the whole ramp so shade 500 sits at the seed's lightness.
    const delta = (seed.l ?? anchor) - anchor;
    return PALETTE_SHADES.map((shade) => {
        // Keep the anchor shade as the seed's exact colour.
        if (shade === 500)
            return { shade, value: seedHex };
        const l = Math.min(0.99, Math.max(0.02, (SHADE_LIGHTNESS[shade] ?? 0.5) + delta));
        // Full chroma near the middle of the ramp, reduced toward the extremes.
        const taper = 1 - Math.abs(l - 0.6) * 0.7;
        const clamped = clampChroma({ mode: 'oklch', l, c: c * Math.max(0.15, taper), h }, 'oklch');
        return { shade, value: formatHex(clamped) ?? '#000000' };
    });
};
