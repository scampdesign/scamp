/**
 * The typed panel for two or more selected elements: the sections that
 * can edit a set, each reading from the first selected element it fits
 * and writing to all of them; a field the elements disagree on reads
 * **Mixed**. Sections that edit one element's own things (name, tag,
 * image, SVG source, position, table style) and Animation show only for
 * a single element. see docs/archive/2026-10-14-multi-select-edit-plan.md
 */
export declare const MultiSelectionPanel: () => JSX.Element;
