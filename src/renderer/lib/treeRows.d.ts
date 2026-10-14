import type { ScampElement } from './element';
/**
 * The layers tree, flattened into rows — and the queries the collapse UI
 * needs around it.
 *
 * Extracted from `ElementTree` so the walk is testable on its own: what the
 * tree shows for a given collapse state is real logic, and the component
 * around it is just rendering.
 * see docs/archive/2026-08-11-tree-collapse-plan.md
 */
export type TreeRow = {
    kind: 'element';
    element: ScampElement;
    depth: number;
} | {
    kind: 'raw';
    parentId: string;
    count: number;
    depth: number;
};
/** Ids the user has collapsed. Keyed for cheap lookup; values are always true. */
export type CollapsedIds = Readonly<Record<string, boolean>>;
/**
 * Does this element produce child rows, and so deserve a disclosure triangle?
 *
 * `inlineFragments` count: they render as a "raw" row beneath the element, so
 * an element with only fragments still has something to hide.
 */
export declare const hasChildRows: (el: ScampElement) => boolean;
/**
 * Walk the tree depth-first into a flat row list, skipping the contents of
 * collapsed elements.
 *
 * The collapsed element itself still renders — it's its descendants (and its
 * own "raw" row) that disappear. Depth is unaffected by collapsing, so
 * indentation never shifts when a branch opens or closes.
 *
 * `seen` guards a malformed tree that references the same id twice (e.g. a
 * duplicate `data-scamp-id`): each element renders at most once, and a cycle
 * can't recurse forever.
 */
export declare const flattenTree: (elements: Record<string, ScampElement>, rootId: string, collapsed?: CollapsedIds) => TreeRow[];
/**
 * Every id beneath `id`, excluding `id` itself — the subtree that
 * Alt+click collapses or expands in one go.
 */
export declare const descendantIds: (elements: Record<string, ScampElement>, id: string) => string[];
/**
 * Ancestors of `id`, nearest parent first. Empty for the root, or for an
 * element that isn't in the map.
 */
export declare const ancestorIds: (elements: Record<string, ScampElement>, id: string) => string[];
/**
 * Is `id` hidden inside a collapsed branch?
 *
 * Drives the "something selected in here" dot: a collapsed row shows it when
 * the selection is somewhere beneath it, so the user isn't left wondering
 * where their selected element went.
 */
export declare const hasCollapsedAncestor: (elements: Record<string, ScampElement>, id: string, collapsed: CollapsedIds) => boolean;
