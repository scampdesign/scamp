import type { ReactNode } from 'react';
type Props = {
    value: number | undefined;
    onChange: (value: number | undefined) => void;
    /** Minimum allowed value (inclusive). Values below revert on blur. */
    min?: number;
    /** Maximum allowed value (inclusive). Values above revert on blur. */
    max?: number;
    /** Placeholder shown when value is undefined. */
    placeholder?: string;
    /** When true, blanking the input writes `undefined` instead of reverting. */
    allowEmpty?: boolean;
    /** Inline prefix label shown inside the input (e.g. "W", "H", "X"). */
    prefix?: string;
    /** Inline suffix — typically a unit indicator icon (e.g. `%`). */
    suffix?: ReactNode;
    /** Tooltip shown on hover. */
    title?: string;
    /** When true, the input is rendered greyed-out and rejects edits. */
    disabled?: boolean;
    /**
     * When true, the displayed value is a layout-derived read-out (e.g.
     * an element's `offsetWidth` while in `fit-content` mode). Renders
     * the value italic + dimmed so it reads as "this is computed, not
     * stored." Editing still works — typing commits a new value via
     * `onChange`, which the parent typically uses to switch the field
     * to a fixed mode.
     */
    computed?: boolean;
    /** Several selected elements disagree: show **Mixed**, and commit whatever is typed. */
    mixed?: boolean;
};
/**
 * Numeric input. Thin wrapper over PrefixSuffixInput that handles
 * parsing, clamping, and arrow-key stepping.
 */
export declare const NumberInput: ({ value, onChange, min, max, placeholder, allowEmpty, prefix, suffix, title, disabled, computed, mixed, }: Props) => JSX.Element;
export {};
