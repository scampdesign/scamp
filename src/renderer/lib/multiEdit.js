import { ROOT_ELEMENT_ID } from './element';
const isTextLike = (el) => el.type === 'text' || el.type === 'input';
export const SECTION_FITS = {
    typography: (el) => el.type === 'text',
    display: isTextLike,
    layout: (el) => !isTextLike(el) && el.type !== 'component-instance',
    size: () => true,
    // Background, border, spacing, visibility: an instance's look belongs
    // to its component (see docs/notes/components-data-model.md).
    box: (el) => el.type !== 'component-instance',
};
/** What one element is, not how it looks: never copied to the rest of a selection. */
const OWN_FIELDS = new Set([
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
export const fitPatch = (el, patch, fits, isLead) => {
    if (!fits(el))
        return null;
    const entries = Object.entries(patch).filter(([key]) => {
        if (!isLead && OWN_FIELDS.has(key))
            return false;
        // The root writes no margin (it's the page itself).
        return !(key === 'margin' && el.id === ROOT_ELEMENT_ID);
    });
    return entries.length === 0 ? null : Object.fromEntries(entries);
};
/** The first selected element a section fits, which it reads its values from. */
export const leadFor = (selectedIds, elements, fits) => {
    for (const id of selectedIds) {
        const el = elements[id];
        if (el !== undefined && fits(el))
            return id;
    }
    return null;
};
