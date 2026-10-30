/**
 * Does this element produce child rows, and so deserve a disclosure triangle?
 *
 * `inlineFragments` count: they render as a "raw" row beneath the element, so
 * an element with only fragments still has something to hide.
 */
export const hasChildRows = (el) => el.childIds.length > 0 || el.inlineFragments.length > 0;
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
export const flattenTree = (elements, rootId, collapsed = {}) => {
    const rows = [];
    const seen = new Set();
    const visit = (id, depth) => {
        const el = elements[id];
        if (!el || seen.has(id))
            return;
        seen.add(id);
        rows.push({ kind: 'element', element: el, depth });
        if (collapsed[id] === true)
            return;
        for (const childId of el.childIds)
            visit(childId, depth + 1);
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
 * The siblings from `anchorId` to `targetId`, inclusive, in tree order —
 * what Shift+click selects. Children of the rows in between stay out. The
 * anchor comes first, since the first selected element is the primary one.
 * When the two aren't siblings, or the anchor isn't on screen, it's just
 * the target; a target that isn't on screen gives nothing.
 */
export const rowRange = (rows, anchorId, targetId) => {
    const els = rows.flatMap((r) => (r.kind === 'element' ? [r.element] : []));
    const to = els.findIndex((e) => e.id === targetId);
    const target = els[to];
    if (target === undefined)
        return [];
    const from = els.findIndex((e) => e.id === anchorId);
    if (from === -1 || els[from]?.parentId !== target.parentId)
        return [targetId];
    const run = els
        .slice(Math.min(from, to), Math.max(from, to) + 1)
        .filter((e) => e.parentId === target.parentId && e.id !== anchorId)
        .map((e) => e.id);
    return [anchorId, ...run];
};
/**
 * Every id beneath `id`, excluding `id` itself — the subtree that
 * Alt+click collapses or expands in one go.
 */
export const descendantIds = (elements, id) => {
    const out = [];
    const seen = new Set([id]);
    const visit = (current) => {
        const el = elements[current];
        if (!el)
            return;
        for (const childId of el.childIds) {
            if (seen.has(childId))
                continue;
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
export const ancestorIds = (elements, id) => {
    const out = [];
    const seen = new Set([id]);
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
export const hasCollapsedAncestor = (elements, id, collapsed) => ancestorIds(elements, id).some((a) => collapsed[a] === true);
