import type { ScampElement } from './types';
/**
 * Generate a 4-character lowercase hex id, matching the format used in the
 * generated CSS class names (`rect_a1b2`).
 */
export declare const generateElementId: () => string;
/**
 * Slugify a user-given element name into a valid CSS class prefix.
 * Lowercases, replaces spaces with hyphens, strips anything that isn't
 * alphanumeric or a hyphen. Returns an empty string if the result is
 * empty (caller falls back to the default type prefix).
 *
 * CSS identifiers can't start with a digit, so a leading digit gets
 * prefixed with `_`.
 */
export declare const slugifyName: (name: string) => string;
/**
 * Remove an element and everything inside it. Pure: returns the new map
 * and the ids it removed, or null for the root or a missing element.
 */
export declare const removeSubtree: (elements: Record<string, ScampElement>, id: string) => {
    elements: Record<string, ScampElement>;
    removed: ReadonlySet<string>;
} | null;
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
export declare const reorderElementPure: (elements: Record<string, ScampElement>, elementId: string, newParentId: string, newIndex: number) => Record<string, ScampElement> | null;
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
export declare const reparentWithPositionPure: (elements: Record<string, ScampElement>, elementId: string, newParentId: string, newIndex: number, x: number, y: number) => Record<string, ScampElement> | null;
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
export declare const groupSiblings: (elements: Record<string, ScampElement>, ids: readonly string[], groupId: string) => {
    elements: Record<string, ScampElement>;
    groupId: string;
} | null;
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
export declare const wrapElement: (elements: Record<string, ScampElement>, elementId: string, wrapperId: string, template: Pick<Partial<ScampElement>, "tag" | "attributes" | "customProperties" | "display" | "flexDirection">) => {
    elements: Record<string, ScampElement>;
    wrapperId: string;
} | null;
/**
 * Inverse of `groupSiblings`: remove an element from the tree and promote
 * its children to take its place in its grandparent. Pure. Returns null
 * if `id` is the root, has no parent, or has no children to promote.
 *
 * If the ungrouped element was a flex container inside a non-flex parent,
 * children are translated by the group's stored (x, y) so they roughly
 * stay where the user saw them. Otherwise their x/y carry over directly.
 */
export declare const ungroupSiblings: (elements: Record<string, ScampElement>, id: string) => {
    elements: Record<string, ScampElement>;
    promotedIds: string[];
} | null;
/**
 * Deep-clone an element and all of its descendants, assigning fresh IDs
 * across the whole subtree. Returns the new root id and a map of just the
 * cloned elements (NOT merged with the original tree) so the caller can
 * splice them into the canvas state in one update.
 *
 * Pure: takes a `randomId` factory rather than calling `generateElementId`
 * directly so tests can supply a deterministic sequence.
 */
export declare const cloneElementSubtree: (elements: Record<string, ScampElement>, rootCloneId: string, newParentId: string | null, existingIds: ReadonlySet<string>, randomId?: () => string) => {
    newId: string;
    cloned: Record<string, ScampElement>;
} | null;
