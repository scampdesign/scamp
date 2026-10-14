import { type ScampElement } from './element';
/**
 * Which elements a properties-panel section can edit. With several
 * elements selected, a section reads from the first one it fits and
 * writes to every one it fits. see docs/archive/2026-10-14-multi-select-edit-plan.md
 */
export type SectionFit = (el: ScampElement) => boolean;
export declare const SECTION_FITS: {
    typography: (el: ScampElement) => boolean;
    display: (el: ScampElement) => boolean;
    layout: (el: ScampElement) => boolean;
    size: () => boolean;
    box: (el: ScampElement) => boolean;
};
/**
 * The part of `patch` that applies to `el`, or null when none of it
 * does. `isLead` is the element the section read the patch from, which
 * keeps its own fields.
 */
export declare const fitPatch: (el: ScampElement, patch: Partial<ScampElement>, fits: SectionFit, isLead: boolean) => Partial<ScampElement> | null;
/** The first selected element a section fits, which it reads its values from. */
export declare const leadFor: (selectedIds: ReadonlyArray<string>, elements: Readonly<Record<string, ScampElement>>, fits: SectionFit) => string | null;
/**
 * The fields the given elements disagree on, read as they render (pass
 * them resolved at the active breakpoint and state). A custom CSS
 * property is reported as `custom:<property>`. Empty for fewer than two.
 */
export declare const mixedFields: (elements: ReadonlyArray<ScampElement>) => string[];
