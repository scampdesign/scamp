/**
 * The typed panel for two or more selected elements: the sections that
 * can edit a set, each reading from the first selected element it fits
 * and writing to all of them. Sections that edit one element's own
 * things (name, tag, image, SVG source, position) and the list sections
 * (shadows, filters, transforms, transitions, animation) show only for
 * a single element. see docs/plans/multi-select-edit-plan.md
 */
export declare const MultiSelectionPanel: () => JSX.Element;
