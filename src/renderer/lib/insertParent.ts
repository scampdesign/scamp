import type { ScampElement } from './element';

/**
 * Rectangles hold children; text / image / svg / input / component-instance
 * are leaves. Mirrors the drop-container rule in `useCanvasGeometry`.
 *
 * Exported so the drag surfaces share one definition — the layers tree
 * used to test `type !== 'text'` on its own and so offered "drop inside"
 * an image. see docs/archive/2026-08-13-drop-placement-helpers-plan.md
 */
export const canContainChildren = (el: ScampElement): boolean =>
  el.type === 'rectangle';

/**
 * Resolve the parent for a newly-inserted element (pasted / imported image
 * or SVG) so it lands inside the user's current focus. Prefers the selected
 * element; when that's a leaf (can't hold children) it walks up to the
 * nearest container ancestor, so the insert becomes a sibling rather than an
 * invalid child. Falls back to `rootId` when nothing is selected or no
 * container ancestor exists. Pure + cycle-guarded.
 */
export const resolveInsertParent = (
  elements: Record<string, ScampElement>,
  selectedId: string | null,
  rootId: string
): string => {
  let cur: ScampElement | undefined = selectedId
    ? elements[selectedId]
    : undefined;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    if (cur.id === rootId || canContainChildren(cur)) return cur.id;
    cur = cur.parentId ? elements[cur.parentId] : undefined;
  }
  return rootId;
};
