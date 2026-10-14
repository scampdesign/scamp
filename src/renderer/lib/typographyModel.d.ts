import type { ThemeToken } from '@shared/types';
/**
 * A semantic text style is a group of tokens sharing a `--text-<name>-`
 * prefix: family / size / weight / leading / (optional) tracking. It maps
 * to a heading or body role (H1, Body, Label, …) and is applied to an
 * element as a set via the WYSIWYG "Text style" dropdown.
 * see docs/archive/2026-07-23-design-system-plan.md
 */
export type TextStyleProp = 'family' | 'size' | 'weight' | 'leading' | 'tracking';
export declare const TEXT_STYLE_PROPS: ReadonlyArray<TextStyleProp>;
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
/** True when a token belongs to a text-style group (vs a bare scale step). */
export declare const isTextStyleToken: (name: string) => boolean;
/** The token name for one prop of a text style. */
export declare const textStyleTokenName: (name: string, prop: TextStyleProp) => string;
/** Title-case a slug into a label: `body-large` → `Body Large`. */
export declare const textStyleLabel: (name: string) => string;
/**
 * Group the flat token list into text styles, in first-seen order. Only
 * `--text-<name>-<prop>` tokens participate; each style carries the raw
 * value for every prop it defines (null otherwise).
 */
export declare const buildTextStyles: (tokens: ReadonlyArray<ThemeToken>) => TextStyle[];
/** A default text-style template (PRD "Default semantic text styles"). */
type TextStyleTemplate = {
    name: string;
    size: string;
    weight: string;
    leading: string;
    /** Family token reference; defaults to `var(--font-sans)`. */
    family?: string;
};
export declare const DEFAULT_TEXT_STYLE_TEMPLATES: ReadonlyArray<TextStyleTemplate>;
/** Emit the `--text-<name>-<prop>` tokens for one template. */
export declare const textStyleTokensFromTemplate: (t: TextStyleTemplate) => ThemeToken[];
/** The full default text-style token set (all templates flattened). */
export declare const defaultTextStyleTokens: () => ThemeToken[];
export {};
