import { ROOT_ELEMENT_ID, type ScampElement } from './element';

/**
 * Which elements a properties-panel section can edit. With several
 * elements selected, a section reads from the first one it fits and
 * writes to every one it fits. see docs/plans/multi-select-edit-plan.md
 */
export type SectionFit = (el: ScampElement) => boolean;

const isTextLike = (el: ScampElement): boolean => el.type === 'text' || el.type === 'input';

export const SECTION_FITS = {
  typography: (el: ScampElement): boolean => el.type === 'text',
  display: isTextLike,
  layout: (el: ScampElement): boolean => !isTextLike(el) && el.type !== 'component-instance',
  size: (): boolean => true,
  // Background, border, spacing, visibility: an instance's look belongs
  // to its component (see docs/notes/components-data-model.md).
  box: (el: ScampElement): boolean => el.type !== 'component-instance',
} satisfies Record<string, SectionFit>;

/** What one element is, not how it looks: never copied to the rest of a selection. */
const OWN_FIELDS: ReadonlySet<keyof ScampElement> = new Set<keyof ScampElement>([
  'id',
  'type',
  'parentId',
  'childIds',
  'name',
  'tag',
  'text',
  'attributes',
  'svgSource',
  'selectOptions',
  'src',
  'alt',
  'tableStyle',
]);

/**
 * The part of `patch` that applies to `el`, or null when none of it
 * does. `isLead` is the element the section read the patch from, which
 * keeps its own fields.
 */
export const fitPatch = (
  el: ScampElement,
  patch: Partial<ScampElement>,
  fits: SectionFit,
  isLead: boolean
): Partial<ScampElement> | null => {
  if (!fits(el)) return null;
  const entries = Object.entries(patch).filter(([key]) => {
    if (!isLead && OWN_FIELDS.has(key as keyof ScampElement)) return false;
    // The root writes no margin (it's the page itself).
    return !(key === 'margin' && el.id === ROOT_ELEMENT_ID);
  });
  return entries.length === 0 ? null : (Object.fromEntries(entries) as Partial<ScampElement>);
};

/** The first selected element a section fits, which it reads its values from. */
export const leadFor = (
  selectedIds: ReadonlyArray<string>,
  elements: Readonly<Record<string, ScampElement>>,
  fits: SectionFit
): string | null => {
  for (const id of selectedIds) {
    const el = elements[id];
    if (el !== undefined && fits(el)) return id;
  }
  return null;
};
