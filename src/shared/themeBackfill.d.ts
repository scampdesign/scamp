export type BackfillResult = {
    content: string;
    /** True when the input was missing one or more of Scamp's default
     *  theme rules and the helper added them. */
    changed: boolean;
};
/**
 * Additively backfill Scamp's project defaults into a `theme.css`
 * string. Pure: takes the raw CSS, returns the (possibly-updated) CSS
 * plus a `changed` flag.
 *
 * Seven independent additive checks:
 *
 *   1. If no `:root` rule declares `--font-sans`, append the token to
 *      the first `:root` rule (or create a `:root` block if there
 *      isn't one).
 *   2. If no top-level rule with a universal (`*`) selector declares
 *      `box-sizing`, append the universal `*, *::before, *::after`
 *      reset.
 *   3. If no top-level `body` rule declares `font-family`, append a
 *      `body { font-family: var(--font-sans); }` rule at the bottom.
 *   4. If the browser-reset sentinel comment isn't already in the
 *      file, append the full reset block (margins, replaced-media
 *      display, interactive-tag chrome). Sentinel-based detection
 *      so user edits to the reset rules don't trigger reinsertion.
 *
 * Each check is independent: the helper inserts only what's missing
 * and leaves user-authored rules / tokens / comments intact. This is
 * the migration path for projects scaffolded before any of these
 * defaults landed in `DEFAULT_THEME_CSS`.
 */
export declare const backfillThemeDefaults: (css: string) => BackfillResult;
