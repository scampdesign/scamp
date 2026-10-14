import { type AvailableFont } from '@store/fontsSlice';
import type { ThemeToken } from '@shared/types';
type Props = {
    /**
     * Current stored CSS `font-family` value, e.g. `"Inter", sans-serif`.
     * An empty string means "system font" (no override).
     */
    value: string;
    /** Available fonts with their source (system vs project). */
    fonts: ReadonlyArray<AvailableFont>;
    /** Font-family theme tokens — shown at the top of the dropdown. */
    fontTokens?: ReadonlyArray<ThemeToken>;
    /**
     * Called with the full formatted CSS expression — `formatFontValue()`
     * output — so the caller writes it straight to `element.fontFamily`.
     * An empty string clears the override.
     */
    onChange: (value: string) => void;
    /** Tooltip shown on hover of the closed trigger. */
    title?: string;
    /** Several selected elements disagree: the trigger reads **Mixed**. */
    mixed?: boolean;
};
export declare const FontPicker: ({ value, fonts, fontTokens, onChange, title, mixed, }: Props) => JSX.Element;
export {};
