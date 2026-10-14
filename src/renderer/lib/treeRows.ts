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

export type TreeRow =
  | { kind: 'element'; element: ScampElement; depth: number }
  | { kind: 'raw'; parentId: string; count: number; depth: number };

/** Ids the user has collapsed. Keyed for cheap lookup; values are always true. */
export type CollapsedIds = Readonly<Record<string, boolean>>;

/**
 * Does this element produce child rows, and so deserve a disclosure triangle?
 *
 * `inlineFragments` count: they render as a "raw" row beneath the element, so
 * an element with only fragments still has something to hide.
 */
export const hasChildRows = (el: ScampElement): boolean =>
  el.childIds.length > 0 || el.inlineFragments.length > 0;

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
export const flattenTree = (
  elements: Record<string, ScampElement>,
  rootId: string,
  collapsed: CollapsedIds = {}
): TreeRow[] => {
  const rows: TreeRow[] = [];
  const seen = new Set<string>();

  const visit = (id: string, depth: number): void => {
    const el = elements[id];
    if (!el || seen.has(id)) return;
    seen.add(id);
    rows.push({ kind: 'element', element: el, depth });

    if (collapsed[id] === true) return;

    for (const childId of el.childIds) visit(childId, depth + 1);
    if (el.inlineFragments.length > 0) {
      rows.push({
        kind: 'raw',
        parentId: el.id,
        count: el.inlineFragments.length,
        depth: depth + 1,
      });
    }
  };

  visit(rootId, 0);
  return rows;
};

/**
 * Every id beneath `id`, excluding `id` itself — the subtree that
 * Alt+click collapses or expands in one go.
 */
export const descendantIds = (
  elements: Record<string, ScampElement>,
  id: string
): string[] => {
  const out: string[] = [];
  const seen = new Set<string>([id]);

  const visit = (current: string): void => {
    const el = elements[current];
    if (!el) return;
    for (const childId of el.childIds) {
      if (seen.has(childId)) continue;
      seen.add(childId);
      out.push(childId);
      visit(childId);
    }
  };

  visit(id);
  return out;
};

/**
 * Ancestors of `id`, nearest parent first. Empty for the root, or for an
 * element that isn't in the map.
 */
export const ancestorIds = (
  elements: Record<string, ScampElement>,
  id: string
): string[] => {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let parentId = elements[id]?.parentId ?? null;

  while (parentId !== null && !seen.has(parentId)) {
    seen.add(parentId);
    out.push(parentId);
    parentId = elements[parentId]?.parentId ?? null;
  }
  return out;
};

/**
 * Is `id` hidden inside a collapsed branch?
 *
 * Drives the "something selected in here" dot: a collapsed row shows it when
 * the selection is somewhere beneath it, so the user isn't left wondering
 * where their selected element went.
 */
export const hasCollapsedAncestor = (
  elements: Record<string, ScampElement>,
  id: string,
  collapsed: CollapsedIds
): boolean => ancestorIds(elements, id).some((a) => collapsed[a] === true);
