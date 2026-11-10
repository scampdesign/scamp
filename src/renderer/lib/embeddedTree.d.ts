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
export type TreeDropPosition = 'before' | 'after' | 'inside';
/**
 * Where a drag over layer `id` would drop, from how far down its row the
 * pointer is (0 to 1): before or after a sibling at its edges, inside it in
 * the middle, and only inside a layer from another parent. Null where it
 * can't go: onto itself, into its own children, into the parent it's
 * already in, or into `body`.
 */
export declare const dropPosition: (tree: EmbeddedTreeNode, drag: TreeDrag, id: string, fraction: number) => TreeDropPosition | null;
