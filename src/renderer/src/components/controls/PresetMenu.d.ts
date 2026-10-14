import type { ReactNode } from 'react';
export type PresetOption = {
    value: string;
    label: string;
    /** Optional secondary text (e.g. the resolved value) shown dimmed. */
    hint?: string;
};
type Props = {
    /** Trigger icon (a tabler icon element). */
    icon: ReactNode;
    /** Accessible label / tooltip for the trigger. */
    ariaLabel: string;
    options: ReadonlyArray<PresetOption>;
    onSelect: (value: string) => void;
    /** Paints the trigger in the accent colour (e.g. a preset is applied). */
    active?: boolean;
    testId?: string;
};
/**
 * A compact icon button that opens a popover menu of presets — used for
 * the Typography "Text style" and Shadow "Preset" pickers so both apply a
 * multi-value preset from a single, consistent icon control. Shares the
 * token-picker button + popover styling. Renders nothing when there are
 * no options. see docs/archive/2026-07-23-design-system-plan.md
 */
export declare const PresetMenu: ({ icon, ariaLabel, options, onSelect, active, testId, }: Props) => JSX.Element | null;
export {};
