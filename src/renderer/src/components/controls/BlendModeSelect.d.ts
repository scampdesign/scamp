import type { BlendMode } from '@lib/element';
type Props = {
    value: BlendMode;
    onChange: (next: BlendMode) => void;
    /** Tooltip shown on hover. */
    title?: string;
    /** Several selected elements disagree: show **Mixed**, and commit whatever is typed. */
    mixed?: boolean;
};
/**
 * Grouped CSS blend-mode dropdown. Used by both `VisibilitySection`
 * (`mix-blend-mode`) and `BackgroundSection` (`background-blend-mode`)
 * — the keyword set is identical across the two CSS properties, so a
 * single component covers both surfaces. The `<optgroup>` headers
 * mirror the categories from `BLEND_MODE_GROUPS` (Darken / Lighten /
 * Contrast / Inversion / Component) so the dropdown reads like the
 * spec.
 */
export declare const BlendModeSelect: ({ value, onChange, title, mixed, }: Props) => JSX.Element;
export {};
