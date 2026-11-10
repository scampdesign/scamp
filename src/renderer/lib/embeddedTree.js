/** Nodes from the root down to `id`, or null when it isn't in the tree. */
const nodesTo = (node, id) => {
    if (node.id === id)
        return [node];
    for (const kid of node.kids) {
        const below = nodesTo(kid, id);
        if (below !== null)
            return [node, ...below];
    }
    return null;
};
/**
 * What dragging layer `id` moves: the layer, or, when it's an only child,
 * the nearest ancestor with siblings, as a drag on the page does. The
 * tree's root is `body`, and its children are the app's root, which is
 * never moved. Null when there's nothing to move.
 */
export const liftInTree = (tree, id) => {
    const path = nodesTo(tree, id);
    if (path === null)
        return null;
    for (let i = path.length - 1; i >= 2; i -= 1) {
        const parent = path[i - 1];
        const node = path[i];
        if (parent !== undefined && node !== undefined && parent.kids.length + parent.more > 1)
            return { id: node.id, parent: parent.id };
    }
    return null;
};
/**
 * Where a drag over layer `id` would drop, from how far down its row the
 * pointer is (0 to 1): before or after a sibling at its edges, inside it in
 * the middle, and only inside a layer from another parent. Null where it
 * can't go: onto itself, into its own children, into the parent it's
 * already in, or into `body`.
 */
export const dropPosition = (tree, drag, id, fraction) => {
    const path = nodesTo(tree, id);
    if (path === null || path.some((n) => n.id === drag.id))
        return null;
    const parent = path[path.length - 2];
    if (parent?.id === drag.parent)
        return fraction < 0.3 ? 'before' : fraction > 0.7 ? 'after' : 'inside';
    return id === drag.parent || path.length < 2 ? null : 'inside';
};
