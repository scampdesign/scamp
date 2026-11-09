import type { EmbeddedTreeNode } from '@shared/types';
/**
 * The Embedded Scamp layers tree, as data. Pure.
 * see docs/plans/embedded-scamp-plan.md
 */
/** A layer being dragged, and the parent it moves within. */
export type TreeDrag = {
    id: string;
    parent: string;
};
/**
 * What dragging layer `id` moves: the layer, or, when it's an only child,
 * the nearest ancestor with siblings, as a drag on the page does. The
 * tree's root is `body`, and its children are the app's root, which is
 * never moved. Null when there's nothing to move.
 */
export declare const liftInTree: (tree: EmbeddedTreeNode, id: string) => TreeDrag | null;
