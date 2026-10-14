import { ancestorIds } from './treeRows';
/**
 * Turn a raw selection into the list of subtree roots a copy or cut
 * should act on.
 *
 * Three things happen here, and each exists because the naive version is
 * wrong in a way the user would notice:
 *
 *   - **The page root expands to its children.** The root is the page
 *     frame — there's only ever one, so copying it is meaningless. Taking
 *     its children instead makes "select the page, copy" mean "copy
 *     everything on this page".
 *   - **Descendants of another selected element are dropped.** Selecting
 *     a container *and* something inside it and copying would otherwise
 *     capture the inner element twice, and paste it twice.
 *   - **The result is in document order**, so pasting several elements
 *     preserves their on-page order rather than the order they happened
 *     to be clicked in.
 *
 * Pure and cycle-guarded. Returns an empty array when nothing is
 * copyable — callers should treat that as "leave the clipboard alone"
 * rather than "clear it".
 *
 * see docs/archive/2026-08-12-copy-cut-paste-plan.md
 */
export const normalizeCopySelection = (elements, ids, rootId) => {
    // Expand the root to its children; keep everything else as-is.
    const expanded = new Set();
    for (const id of ids) {
        if (id === rootId) {
            const root = elements[rootId];
            if (root)
                for (const childId of root.childIds)
                    expanded.add(childId);
            continue;
        }
        if (elements[id])
            expanded.add(id);
    }
    // Drop anything already covered by an ancestor in the set.
    const roots = new Set();
    for (const id of expanded) {
        if (ancestorIds(elements, id).some((a) => expanded.has(a)))
            continue;
        roots.add(id);
    }
    // Emit in document order by walking the tree, not the selection.
    const ordered = [];
    const seen = new Set();
    const visit = (id) => {
        if (seen.has(id))
            return;
        seen.add(id);
        if (roots.has(id))
            ordered.push(id);
        const el = elements[id];
        if (!el)
            return;
        for (const childId of el.childIds)
            visit(childId);
    };
    visit(rootId);
    // A selected element that isn't reachable from the root (a malformed
    // tree) still gets copied — dropping it silently would be worse.
    for (const id of roots)
        if (!seen.has(id))
            ordered.push(id);
    return ordered;
};
