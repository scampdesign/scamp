import { effectiveDisplay } from '../effectiveDisplay';
import { ROOT_ELEMENT_ID } from './types';
/**
 * Generate a 4-character lowercase hex id, matching the format used in the
 * generated CSS class names (`rect_a1b2`).
 */
export const generateElementId = () => {
    const chars = '0123456789abcdef';
    let id = '';
    for (let i = 0; i < 4; i += 1) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
};
/**
 * Slugify a user-given element name into a valid CSS class prefix.
 * Lowercases, replaces spaces with hyphens, strips anything that isn't
 * alphanumeric or a hyphen. Returns an empty string if the result is
 * empty (caller falls back to the default type prefix).
 *
 * CSS identifiers can't start with a digit, so a leading digit gets
 * prefixed with `_`.
 */
export const slugifyName = (name) => {
    const slug = name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .replace(/_{2,}/g, '_')
        .replace(/^_|_$/g, '');
    if (slug.length === 0)
        return '';
    // CSS identifiers can't start with a digit.
    if (/^[0-9]/.test(slug))
        return `_${slug}`;
    return slug;
};
/**
 * Remove an element and everything inside it. Pure: returns the new map
 * and the ids it removed, or null for the root or a missing element.
 */
export const removeSubtree = (elements, id) => {
    if (id === ROOT_ELEMENT_ID)
        return null;
    const target = elements[id];
    if (!target)
        return null;
    const removed = new Set();
    const visit = (visitId) => {
        if (removed.has(visitId))
            return;
        removed.add(visitId);
        for (const childId of elements[visitId]?.childIds ?? [])
            visit(childId);
    };
    visit(id);
    const next = {};
    for (const [key, value] of Object.entries(elements)) {
        if (!removed.has(key))
            next[key] = value;
    }
    if (target.parentId) {
        const parent = next[target.parentId];
        if (parent) {
            next[target.parentId] = { ...parent, childIds: parent.childIds.filter((childId) => childId !== id) };
        }
    }
    return { elements: next, removed };
};
/**
 * Move an element to a new parent and/or position within its current parent.
 *
 * Pure: returns a new elements map. Returns null when the move isn't valid:
 *   - moving the root element
 *   - moving an element into itself or any of its descendants (would
 *     create a cycle in the tree)
 *   - referencing a non-existent element or parent
 *
 * `newIndex` is the position in the *destination* parent's `childIds` AFTER
 * the move. When the destination parent is the same as the current parent
 * and the new index is past the element's current slot, the function adjusts
 * for the removal so callers can pass "the slot the user dropped on" without
 * worrying about off-by-one math.
 */
export const reorderElementPure = (elements, elementId, newParentId, newIndex) => {
    if (elementId === ROOT_ELEMENT_ID)
        return null;
    const el = elements[elementId];
    if (!el || !el.parentId)
        return null;
    const newParent = elements[newParentId];
    if (!newParent)
        return null;
    // Cycle check: walk newParent's ancestor chain looking for elementId.
    let cursor = newParentId;
    while (cursor) {
        if (cursor === elementId)
            return null;
        cursor = elements[cursor]?.parentId ?? null;
    }
    const oldParentId = el.parentId;
    const next = { ...elements };
    if (oldParentId === newParentId) {
        // Same parent: a single splice + reinsert in one shot.
        const parent = elements[newParentId];
        const oldIdx = parent.childIds.indexOf(elementId);
        if (oldIdx < 0)
            return null;
        // Adjust the destination index to account for the removal happening
        // BEFORE the insert when moving forward.
        let dest = Math.max(0, Math.min(parent.childIds.length, newIndex));
        if (oldIdx < dest)
            dest -= 1;
        if (dest === oldIdx)
            return next; // no-op move
        const childIds = [...parent.childIds];
        childIds.splice(oldIdx, 1);
        childIds.splice(dest, 0, elementId);
        next[newParentId] = { ...parent, childIds };
        return next;
    }
    // Different parents.
    const oldParent = elements[oldParentId];
    if (!oldParent)
        return null;
    next[oldParentId] = {
        ...oldParent,
        childIds: oldParent.childIds.filter((id) => id !== elementId),
    };
    const dest = Math.max(0, Math.min(newParent.childIds.length, newIndex));
    const newChildIds = [...newParent.childIds];
    newChildIds.splice(dest, 0, elementId);
    next[newParentId] = { ...newParent, childIds: newChildIds };
    next[elementId] = { ...el, parentId: newParentId };
    return next;
};
/**
 * Reparent an element AND set its position in one shot. Same validity
 * rules and index handling as `reorderElementPure` (rejects the root,
 * cycle-checks the destination, clamps the index), but additionally
 * writes `{ x, y }` onto the moved element.
 *
 * Used when dropping onto an **absolute** (non-flow) container on the
 * canvas, where the element needs explicit coordinates in the new
 * parent's local space — a flex child dragged out to an absolute parent
 * has no meaningful stored x/y, and an absolute element moving between
 * absolute parents needs its drop point translated into the new frame.
 * Flow (flex/grid) drops use `reorderElementPure` directly because
 * layout owns the child's position there.
 *
 * Pure: returns a new elements map, or null when the move is invalid
 * (same cases as `reorderElementPure`).
 *
 * see docs/plans/canvas-drag-reparent-plan.md
 */
export const reparentWithPositionPure = (elements, elementId, newParentId, newIndex, x, y) => {
    const next = reorderElementPure(elements, elementId, newParentId, newIndex);
    if (!next)
        return null;
    const moved = next[elementId];
    if (!moved)
        return null;
    return { ...next, [elementId]: { ...moved, x, y } };
};
/**
 * Wrap a contiguous-by-parent set of sibling element ids in a new flex
 * container. Pure: takes the current elements map and returns a new one,
 * leaving the input untouched. Returns null when the operation isn't
 * meaningful (no ids, mixed parents, root in the set).
 *
 * The returned `elements` map has:
 *   - the new group element keyed by `groupId`
 *   - the moved children with `parentId` set to `groupId` and `x/y` reset
 *     to 0 (they're flex items now)
 *   - the original parent's `childIds` updated to contain `groupId` in
 *     place of the run of grouped ids
 *
 * Bounding box: when the parent is a non-flex container, the new group is
 * placed at the bounding box of the selected children's stored x/y. When
 * the parent is itself flex, the group's x/y is 0 (flex layout owns it).
 */
export const groupSiblings = (elements, ids, groupId) => {
    if (ids.length === 0)
        return null;
    if (ids.includes(ROOT_ELEMENT_ID))
        return null;
    // Validate every id exists and shares the same parent.
    const first = elements[ids[0]];
    if (!first || !first.parentId)
        return null;
    const parentId = first.parentId;
    for (const id of ids) {
        const el = elements[id];
        if (!el)
            return null;
        if (el.parentId !== parentId)
            return null;
    }
    const parent = elements[parentId];
    if (!parent)
        return null;
    // Order the selected ids by their position in the parent's childIds so
    // grouping never reorders them.
    const idSet = new Set(ids);
    const ordered = parent.childIds.filter((id) => idSet.has(id));
    if (ordered.length === 0)
        return null;
    const isFlexParent = parent.display === 'flex';
    // Compute the bounding box from stored coordinates (only meaningful when
    // the parent is non-flex). Flex parents place children via layout flow
    // so x/y is 0 anyway.
    let groupX = 0;
    let groupY = 0;
    let groupW = 200;
    let groupH = 200;
    if (!isFlexParent) {
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const id of ordered) {
            const el = elements[id];
            if (el.x < minX)
                minX = el.x;
            if (el.y < minY)
                minY = el.y;
            if (el.x + el.widthValue > maxX)
                maxX = el.x + el.widthValue;
            if (el.y + el.heightValue > maxY)
                maxY = el.y + el.heightValue;
        }
        groupX = Math.round(minX);
        groupY = Math.round(minY);
        groupW = Math.max(20, Math.round(maxX - minX));
        groupH = Math.max(20, Math.round(maxY - minY));
    }
    const group = {
        id: groupId,
        type: 'rectangle',
        parentId,
        childIds: [...ordered],
        // Groups default to `fit-content` on both axes so the wrapper hugs
        // the children visually. The bounding-box derived widthValue /
        // heightValue is still kept around as a sensible "fixed" fallback
        // in case the user switches the group out of fit-content later.
        widthMode: 'fit-content',
        widthValue: groupW,
        heightMode: 'fit-content',
        heightValue: groupH,
        x: groupX,
        y: groupY,
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        flexWrap: 'nowrap',
        alignContent: 'normal',
        gridTemplateColumns: '',
        gridTemplateRows: '',
        columnGap: 0,
        rowGap: 0,
        justifyItems: 'stretch',
        gridColumn: '',
        gridRow: '',
        alignSelf: 'auto',
        justifySelf: 'stretch',
        flexGrow: 0,
        flexShrink: 1,
        flexBasis: '',
        order: 0,
        padding: [0, 0, 0, 0],
        margin: [0, 0, 0, 0],
        backgroundColor: 'transparent',
        borderRadius: [0, 0, 0, 0],
        borderWidth: [0, 0, 0, 0],
        borderStyle: 'none',
        borderColor: '#000000',
        opacity: 1,
        visibilityMode: 'visible',
        mixBlendMode: 'normal',
        backgroundBlendMode: 'normal',
        position: 'auto',
        boxShadows: [],
        filters: [],
        backdropFilters: [],
        transforms: [],
        transformOrigin: '',
        transitions: [],
        inlineFragments: [],
        toggledOffGroups: [],
        customProperties: {},
    };
    // Build the next elements map.
    const next = { ...elements };
    // Update the parent: replace the run of grouped children with the group.
    const firstIdx = parent.childIds.indexOf(ordered[0]);
    const newParentChildIds = parent.childIds.filter((id) => !idSet.has(id));
    newParentChildIds.splice(firstIdx, 0, groupId);
    next[parentId] = { ...parent, childIds: newParentChildIds };
    // Re-parent each grouped child onto the new group with x/y reset.
    for (const id of ordered) {
        const child = elements[id];
        next[id] = { ...child, parentId: groupId, x: 0, y: 0 };
    }
    next[groupId] = group;
    return { elements: next, groupId };
};
/**
 * Wrap a single element in a freshly-created Scamp parent. Used by
 * the Link section's "Wrap in `<a>`" affordance to preserve the
 * original element (e.g. an `<img>` or a semantic block tag) while
 * making it clickable.
 *
 * The wrapper inherits the wrapped element's position, width, and
 * height defaults (so the wrapper visually occupies the same slot
 * the child used to). The child's `x`/`y` reset to 0 because it
 * now lives at the origin of its new parent. Any styling the user
 * wants on the wrapper is up to them — the template only sets the
 * fields the caller passes in.
 *
 * Pure. Returns null when the operation isn't valid:
 *   - wrapping the root
 *   - target element doesn't exist or has no parent
 *
 * `wrapperId` is supplied by the caller so the canvas store can
 * pre-allocate it without scanning the existing id space.
 *
 * `template` carries the fields the caller wants on the wrapper —
 * typically `tag`, `attributes`, `customProperties`. Anything not
 * supplied falls back to the same defaults as a new rectangle.
 */
export const wrapElement = (elements, elementId, wrapperId, template) => {
    if (elementId === ROOT_ELEMENT_ID)
        return null;
    const target = elements[elementId];
    if (!target || !target.parentId)
        return null;
    const parent = elements[target.parentId];
    if (!parent)
        return null;
    const parentDisplay = effectiveDisplay(parent);
    const parentIsLayout = parentDisplay === 'flex' || parentDisplay === 'grid';
    // Wrapper takes over the child's slot. Hugs content so it doesn't
    // visually balloon past the wrapped element. Position carries over
    // from the child (so the wrapper sits where the child sat); flex/
    // grid parents own positioning so x/y is 0 there.
    const wrapper = {
        id: wrapperId,
        type: 'rectangle',
        parentId: parent.id,
        childIds: [elementId],
        widthMode: 'fit-content',
        widthValue: target.widthValue,
        heightMode: 'fit-content',
        heightValue: target.heightValue,
        x: parentIsLayout ? 0 : target.x,
        y: parentIsLayout ? 0 : target.y,
        display: template.display ?? 'none',
        flexDirection: template.flexDirection ?? 'row',
        gap: 0,
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        gridTemplateColumns: '',
        gridTemplateRows: '',
        columnGap: 0,
        rowGap: 0,
        justifyItems: 'stretch',
        flexWrap: 'nowrap',
        alignContent: 'normal',
        flexGrow: 0,
        flexShrink: 1,
        flexBasis: '',
        order: 0,
        gridColumn: '',
        gridRow: '',
        alignSelf: 'auto',
        justifySelf: 'stretch',
        padding: [0, 0, 0, 0],
        margin: [0, 0, 0, 0],
        backgroundColor: 'transparent',
        borderRadius: [0, 0, 0, 0],
        borderWidth: [0, 0, 0, 0],
        borderStyle: 'none',
        borderColor: '#000000',
        opacity: 1,
        visibilityMode: 'visible',
        mixBlendMode: 'normal',
        backgroundBlendMode: 'normal',
        position: 'auto',
        boxShadows: [],
        filters: [],
        backdropFilters: [],
        transforms: [],
        transformOrigin: '',
        transitions: [],
        inlineFragments: [],
        toggledOffGroups: [],
        customProperties: { ...(template.customProperties ?? {}) },
        ...(template.tag !== undefined ? { tag: template.tag } : {}),
        ...(template.attributes !== undefined
            ? { attributes: { ...template.attributes } }
            : {}),
    };
    // Splice wrapper into the parent's childIds at the target's old
    // position; reparent the target onto the wrapper with x/y reset.
    const targetIdx = parent.childIds.indexOf(elementId);
    if (targetIdx < 0)
        return null;
    const newParentChildIds = [...parent.childIds];
    newParentChildIds.splice(targetIdx, 1, wrapperId);
    const next = { ...elements };
    next[parent.id] = { ...parent, childIds: newParentChildIds };
    next[elementId] = { ...target, parentId: wrapperId, x: 0, y: 0 };
    next[wrapperId] = wrapper;
    return { elements: next, wrapperId };
};
/**
 * Inverse of `groupSiblings`: remove an element from the tree and promote
 * its children to take its place in its grandparent. Pure. Returns null
 * if `id` is the root, has no parent, or has no children to promote.
 *
 * If the ungrouped element was a flex container inside a non-flex parent,
 * children are translated by the group's stored (x, y) so they roughly
 * stay where the user saw them. Otherwise their x/y carry over directly.
 */
export const ungroupSiblings = (elements, id) => {
    if (id === ROOT_ELEMENT_ID)
        return null;
    const target = elements[id];
    if (!target || !target.parentId)
        return null;
    if (target.childIds.length === 0)
        return null;
    const parent = elements[target.parentId];
    if (!parent)
        return null;
    const parentIsFlex = parent.display === 'flex';
    const targetIsFlex = target.display === 'flex';
    // Splice the target's children into the parent's childIds at the
    // target's position, in their original order.
    const idx = parent.childIds.indexOf(id);
    const newParentChildIds = [...parent.childIds];
    if (idx >= 0) {
        newParentChildIds.splice(idx, 1, ...target.childIds);
    }
    const next = {};
    for (const [key, value] of Object.entries(elements)) {
        if (key === id)
            continue;
        next[key] = value;
    }
    next[target.parentId] = { ...parent, childIds: newParentChildIds };
    for (const childId of target.childIds) {
        const child = elements[childId];
        if (!child)
            continue;
        let nextX = child.x;
        let nextY = child.y;
        if (parentIsFlex) {
            // Children become flex items of the grandparent — flex layout owns
            // their position so x/y is meaningless. Reset to 0 for cleanliness.
            nextX = 0;
            nextY = 0;
        }
        else if (targetIsFlex) {
            // Children were flex items inside the (now-removed) group, so their
            // stored x/y is 0. Position them at the group's location so they
            // appear where the group was.
            nextX = target.x;
            nextY = target.y;
        }
        else {
            // Both non-flex: child's x/y was relative to the group; translate
            // to be relative to the grandparent.
            nextX = target.x + child.x;
            nextY = target.y + child.y;
        }
        next[childId] = { ...child, parentId: target.parentId, x: nextX, y: nextY };
    }
    return { elements: next, promotedIds: [...target.childIds] };
};
/**
 * Deep-clone an element and all of its descendants, assigning fresh IDs
 * across the whole subtree. Returns the new root id and a map of just the
 * cloned elements (NOT merged with the original tree) so the caller can
 * splice them into the canvas state in one update.
 *
 * Pure: takes a `randomId` factory rather than calling `generateElementId`
 * directly so tests can supply a deterministic sequence.
 */
export const cloneElementSubtree = (elements, rootCloneId, newParentId, existingIds, randomId = generateElementId) => {
    const original = elements[rootCloneId];
    if (!original)
        return null;
    const cloned = {};
    const taken = new Set(existingIds);
    const freshId = () => {
        for (let attempt = 0; attempt < 32; attempt += 1) {
            const candidate = randomId();
            if (!taken.has(candidate)) {
                taken.add(candidate);
                return candidate;
            }
        }
        // Random space exhausted (extremely unlikely): fall back to a
        // deterministic suffix so we never return a colliding id.
        let i = 0;
        while (taken.has(`d${i}`))
            i += 1;
        const fallback = `d${i}`;
        taken.add(fallback);
        return fallback;
    };
    const visit = (oldId, parentId) => {
        const old = elements[oldId];
        if (!old)
            return null;
        const newId = freshId();
        const childIds = [];
        for (const childId of old.childIds) {
            const newChildId = visit(childId, newId);
            if (newChildId)
                childIds.push(newChildId);
        }
        cloned[newId] = {
            ...old,
            id: newId,
            parentId,
            childIds,
            // Defensive copies of nested mutable values.
            customProperties: { ...old.customProperties },
            padding: [old.padding[0], old.padding[1], old.padding[2], old.padding[3]],
            margin: [old.margin[0], old.margin[1], old.margin[2], old.margin[3]],
            borderRadius: [old.borderRadius[0], old.borderRadius[1], old.borderRadius[2], old.borderRadius[3]],
            borderWidth: [old.borderWidth[0], old.borderWidth[1], old.borderWidth[2], old.borderWidth[3]],
            boxShadows: old.boxShadows.map((s) => ({ ...s })),
            filters: old.filters.map((f) => ({ ...f })),
            backdropFilters: old.backdropFilters.map((f) => ({ ...f })),
            toggledOffGroups: [...old.toggledOffGroups],
            // Component-instance clones get a fresh instance id and a copy
            // of the prop overrides map. The instanceId IS the per-page
            // identity — two instances of the same component need distinct
            // ids or selection / overrides collide.
            ...(old.type === 'component-instance'
                ? {
                    instanceId: `inst_${freshId()}`,
                    propOverrides: { ...(old.propOverrides ?? {}) },
                }
                : {}),
            // `name` rides along on the spread above, deliberately: the clone
            // keeps the user's name (and so its `menu_` class prefix) and only
            // the id suffix changes. see docs/archive/2026-08-11-duplicate-preserves-names-plan.md
        };
        return newId;
    };
    const newId = visit(rootCloneId, newParentId);
    if (!newId)
        return null;
    return { newId, cloned };
};
