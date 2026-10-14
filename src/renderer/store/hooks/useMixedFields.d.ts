import { type SectionFit } from '@lib/multiEdit';
import type { ScampElement } from '@lib/element';
export type MixedFields = {
    isMixed: (key: keyof ScampElement) => boolean;
    isMixedCustom: (property: string) => boolean;
};
/**
 * Which of a section's fields the selected elements it fits disagree on,
 * at the active breakpoint and state. Nothing is mixed for one element.
 * see docs/archive/2026-10-14-multi-select-edit-plan.md
 */
export declare const useMixedFields: (fits: SectionFit) => MixedFields;
