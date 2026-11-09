import type { EmbeddedTreeNode } from '@shared/types';

/**
 * The Embedded Scamp layers tree, as data. Pure.
 * see docs/plans/embedded-scamp-plan.md
 */

/** A layer being dragged, and the parent it moves within. */
export type TreeDrag = { id: string; parent: string };

/** Nodes from the root down to `id`, or null when it isn't in the tree. */
const nodesTo = (node: EmbeddedTreeNode, id: string): EmbeddedTreeNode[] | null => {
  if (node.id === id) return [node];
  for (const kid of node.kids) {
    const below = nodesTo(kid, id);
    if (below !== null) return [node, ...below];
  }
  return null;
};

/**
 * What dragging layer `id` moves: the layer, or, when it's an only child,
 * the nearest ancestor with siblings, as a drag on the page does. The
 * tree's root is `body`, and its children are the app's root, which is
 * never moved. Null when there's nothing to move.
 */
export const liftInTree = (tree: EmbeddedTreeNode, id: string): TreeDrag | null => {
  const path = nodesTo(tree, id);
  if (path === null) return null;
  for (let i = path.length - 1; i >= 2; i -= 1) {
    const parent = path[i - 1];
    const node = path[i];
    if (parent !== undefined && node !== undefined && parent.kids.length + parent.more > 1) return { id: node.id, parent: parent.id };
  }
  return null;
};
