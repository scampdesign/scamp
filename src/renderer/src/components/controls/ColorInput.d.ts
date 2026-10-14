import type { ScampElement } from '@lib/element';
import type { ThemeToken } from '@shared/types';
type Props = {
    value: string;
    onChange: (value: string) => void;
    /**
     * Called on every drag tick during an active picker
     * interaction. Fires BEFORE `onChange` (which only fires on
     * release). Implementations should apply the value to the
     * canvas DOM directly — bypassing React/Zustand — so the
     * preview updates at the cursor's frame rate without paying
     * the cost of the full sync pipeline on every tick.
     *
     * When omitted, ColorInput suppresses the per-tick preview
     * entirely (legacy callers see the same release-only
     * behaviour they had before).
     */
    onPreview?: (value: string) => void;
    /**
     * The element this picker edits. Used to tag the single
     * history entry that's committed on drag release. Without it,
     * the drag still commits via `onChange` but the entry doesn't
     * carry an element id, so the history-panel label reads
     * "Changed styles" instead of "Changed background — rect_a1b2".
     */
    historyElementId?: string;
    /**
     * The `ScampElement` field the picker edits. Used to label the
     * history entry. Optional for the same reason
     * `historyElementId` is.
     */
    historyPropertyKey?: keyof ScampElement;
    /** Override preset color swatches (e.g. with project-derived colors). */
    presetColors?: ReadonlyArray<string>;
    /** Theme tokens — shown in the Tokens tab of the popover. */
    tokens?: ReadonlyArray<ThemeToken>;
    /** Called when the user clicks "Add Token" from the empty tokens tab. */
    onOpenTheme?: () => void;
    /**
     * When true, the picker treats the value as opaque and the
     * separate opacity input is hidden. Used by sections (e.g.
     * Shadows) that surface opacity as their own control to keep
     * the two axes from racing.
     */
    disableAlpha?: boolean;
    /**
     * Render only the color swatch (no hex text field), filling its
     * container. The swatch still opens the full picker popover on click.
     * Used by the theme panel's palette ramp, where the color block is the
     * content and the hex lives in the popover.
     */
    swatchOnly?: boolean;
    /**
     * Accessible name for the swatch trigger. Defaults to "Pick color".
     * Set it when a screen has several pickers that need telling apart —
     * the theme panel names each one after the token it maps.
     */
    ariaLabel?: string;
    /**
     * Which tab the popover opens on. Defaults to `'color'`. The theme
     * panel opens on `'tokens'`, where mapping to a primitive is the
     * common case and a literal colour is the exception.
     */
    defaultTab?: 'color' | 'tokens';
    /** Several selected elements disagree: show **Mixed**, and commit whatever is picked or typed. */
    mixed?: boolean;
};
export declare const ColorInput: ({ value, onChange, onPreview, historyElementId, historyPropertyKey, presetColors, tokens, onOpenTheme, disableAlpha, swatchOnly, ariaLabel, defaultTab, mixed, }: Props) => JSX.Element;
export {};
