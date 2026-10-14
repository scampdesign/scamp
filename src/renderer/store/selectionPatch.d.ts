import type { ScampElement } from '@lib/element';
import { type SectionFit } from '@lib/multiEdit';
/**
 * `patchElement` for a properties-panel section: with several elements
 * selected, the patch reaches each one `fits` accepts, routed into its
 * own breakpoint or state override. see docs/plans/multi-select-edit-plan.md
 */
export declare const patchSelection: (fits: SectionFit, leadId: string, patch: Partial<ScampElement>) => void;
/** `patchCustomProperties` for a section; each element merges into its own custom CSS. */
export declare const patchSelectionCustomProperties: (fits: SectionFit, leadId: string, patch: Record<string, string | undefined>) => void;
export type SelectionPatchers = {
    patchElement: (id: string, patch: Partial<ScampElement>) => void;
    patchCustomProperties: (id: string, patch: Record<string, string | undefined>) => void;
};
/** The two writers above, bound to one section's fit. */
export declare const selectionPatchers: (fits: SectionFit) => SelectionPatchers;
