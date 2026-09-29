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
/**
 * A colour as the panel wants it: `#rrggbb`, or `rgba(...)` kept as-is
 * when it is translucent, since hex-with-alpha is not what the colour
 * control reads.
 */
export declare const normalizeColor: (color: string) => string | null;
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
export declare const extractTokens: (elements: Record<string, ScampElement>, options?: ExtractOptions) => TokenExtraction;
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
export declare const resolveTokenNames: (tokens: ReadonlyArray<ExtractedToken>, existing: ReadonlyMap<string, string>) => ExtractedToken[];
