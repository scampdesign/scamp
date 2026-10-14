import type { ScampElement } from '@lib/element';
import { type SectionFit } from '@lib/multiEdit';
/**
 * A patch, or a function that builds one from an element as it renders
 * at the active breakpoint and state. Pass a function when the patch
 * depends on the element's current values (axis gaps, a layout switch),
 * so each selected element gets one built from its own.
 */
export type PatchInput = Partial<ScampElement> | ((resolved: ScampElement) => Partial<ScampElement>);
/**
 * `patchElement` for a properties-panel section: with several elements
 * selected, the patch reaches each one `fits` accepts, routed into its
 * own breakpoint or state override. see docs/archive/2026-10-14-multi-select-edit-plan.md
 */
export declare const patchSelection: (fits: SectionFit, leadId: string, input: PatchInput) => void;
/** `patchCustomProperties` for a section; each element merges into its own custom CSS. */
export declare const patchSelectionCustomProperties: (fits: SectionFit, leadId: string, patch: Record<string, string | undefined>) => void;
/**
 * Run `edit` on every selected element `fits` accepts when `leadId` is
 * part of a multi-selection, as one undo step; otherwise on `leadId`
 * alone. For panel actions that aren't a patch: an override reset, a
 * group's eye toggle.
 */
export declare const forSelection: (fits: SectionFit, leadId: string, propertyKeys: ReadonlyArray<keyof ScampElement>, edit: (id: string) => void) => void;
export type SelectionPatchers = {
    patchElement: (id: string, patch: PatchInput) => void;
    patchCustomProperties: (id: string, patch: Record<string, string | undefined>) => void;
};
/** The two writers above, bound to one section's fit. */
export declare const selectionPatchers: (fits: SectionFit) => SelectionPatchers;
