import type { ThemeToken } from '@shared/types';
type Props = {
    /**
     * Current stored CSS value — e.g. `"16px"`, `"1rem"`, `"1.5"`, or
     * `"var(--text-lg)"`. Undefined for empty.
     */
    value: string | undefined;
    /** Tokens eligible for this field (pre-filtered by category). */
    tokens: ReadonlyArray<ThemeToken>;
    /**
     * Unit appended when the user types a bare number (Figma-style
     * fallback). Pass `''` when unitless is the preferred form
     * (line-height).
     */
    defaultUnit: 'px' | '';
    onChange: (value: string | undefined) => void;
    /** Called when the user clicks "Add token" from the empty popover. */
    onOpenTheme?: () => void;
    /** Inline prefix label (e.g. "Sz", "LH"). */
    prefix?: string;
    placeholder?: string;
    /** Tooltip on the whole row. */
    title?: string;
    /** Several selected elements disagree: show **Mixed**, and commit whatever is typed. */
    mixed?: boolean;
};
export declare const TokenOrNumberInput: ({ value, tokens, defaultUnit, onChange, onOpenTheme, prefix, placeholder, title, mixed, }: Props) => JSX.Element;
export {};
