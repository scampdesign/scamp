import type { ScampElement } from './element';
/**
 * Work out which typefaces an imported page needs, and where each one
 * has to come from.
 *
 * A page's type is most of its character, and an import that silently
 * falls back to Helvetica looks nothing like the thing it copied. But
 * the fix is different per family: one may already be installed, one is
 * on Google Fonts and can simply be embedded, and one is a licensed
 * face that only the original site has. Guessing wrong in either
 * direction is bad — embedding a family the user already has is noise,
 * and staying quiet about a missing one leaves them wondering why the
 * import looks off.
 *
 * Pure. The two things it cannot know on its own — what is installed,
 * and what Google serves — arrive as arguments.
 * see docs/plans/website-import-plan.md
 */
export type FontNeed = {
    /** The family as the page asked for it, unquoted. */
    family: string;
    /** How many elements use it. The headline face is usually not the commonest. */
    uses: number;
};
export type FontResolution = {
    family: string;
    uses: number;
    status: 'system';
} | {
    family: string;
    uses: number;
    status: 'google';
    url: string;
} | {
    family: string;
    uses: number;
    status: 'missing';
};
/**
 * The family a stack actually wants.
 *
 * `getComputedStyle` returns the whole stack — `Fraunces, "Fraunces
 * Fallback", Georgia, serif` — and only the head is a decision. The
 * rest is the author's fallback chain, which the browser will apply on
 * its own if the head is unavailable.
 *
 * A `… Fallback` entry is what Next.js and similar emit for a locally
 * metric-matched face; it is never something to install.
 */
export declare const primaryFamily: (stack: string) => string | null;
/** Every family an element tree asks for, by how many elements want it. */
export declare const fontsNeededBy: (elements: Record<string, ScampElement>) => FontNeed[];
/** Is this name a typeface to find, or something the OS already answers? */
export declare const needsResolving: (family: string) => boolean;
/**
 * Classify each family against what is installed and what Google
 * serves.
 *
 * `installed` is matched case-insensitively: the Local Font Access API
 * reports `Inter Tight` where CSS may say `inter tight`, and treating
 * those as different fonts would embed one the user already has.
 */
export declare const resolveFonts: (needs: ReadonlyArray<FontNeed>, installed: ReadonlyArray<string>, googleUrls: Readonly<Record<string, string>>) => FontResolution[];
/** One variable axis of a family, as Google's metadata describes it. */
export type FontAxis = {
    /** Four-character axis tag: `wght`, `opsz`, `SOFT`, and so on. */
    tag: string;
    min: number;
    max: number;
};
/**
 * One Google Fonts URL for every embeddable family.
 *
 * Google's `css2` endpoint takes repeated `family=` parameters, so the
 * whole import is a single request and a single `@import` line rather
 * than one per face. A weight range is requested because a page that
 * used a bold heading and a light caption needs both, and asking for
 * the default would silently flatten them.
 *
 * `axesByFamily` is the same kind of argument as `installed` above: a
 * fact about what Google serves, which this function cannot know and
 * must not go and find out. Supply it and every axis is requested across
 * its full range; omit it and only weights are, which is the old
 * behaviour and still correct for a family whose only axis is weight.
 *
 * **Naming the axes matters more than it looks.** Google INSTANCES the
 * font to the axes you ask for, so a request for `wght` alone returns a
 * file with every other axis frozen at its default. Fraunces defaults to
 * `opsz` 14, and a 60px headline set in 14px-optical glyphs is about 7%
 * wider — enough to wrap a line that fits on the real site, which then
 * pushes every section below it down the page. 158 of Google's ~1950
 * families have an axis beyond weight, so this is not a curiosity.
 * see docs/notes/import-variable-fonts.md
 */
export declare const googleFontsUrlFor: (families: ReadonlyArray<string>, axesByFamily?: Readonly<Record<string, ReadonlyArray<FontAxis>>>) => string | null;
