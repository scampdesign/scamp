/**
 * A DOM selection inside a text element, as offsets over its joined
 * text.
 *
 * Offsets, not nodes, because that is what the run operations take:
 * `applyStyleToRange` and `styleOfRange` count characters across the
 * whole sentence, and a caller holding a `Range` has no way to convert
 * one to the other. A styled sentence renders as several spans, so the
 * selection routinely starts in one text node and ends in another.
 * see docs/plans/inline-spans-plan.md
 */
/** Every text node under `host`, in the order they render. */
const textNodesOf = (host) => {
    const out = [];
    const walk = (node) => {
        for (const child of Array.from(node.childNodes)) {
            if (child.nodeType === 3)
                out.push(child);
            else
                walk(child);
        }
    };
    walk(host);
    return out;
};
/**
 * Where a (node, offset) pair falls in the joined text, or null when the
 * node is not inside `host`.
 */
const offsetOf = (host, node, offset) => {
    let seen = 0;
    for (const text of textNodesOf(host)) {
        if (text === node)
            return seen + offset;
        seen += text.data.length;
    }
    // A selection can anchor on an ELEMENT rather than a text node — an
    // empty span, or a triple-click that selects the whole host. Then the
    // offset counts child nodes, and everything before that child counts.
    if (node === host) {
        let counted = 0;
        const children = Array.from(host.childNodes).slice(0, offset);
        for (const child of children)
            counted += (child.textContent ?? '').length;
        return counted;
    }
    return null;
};
/**
 * The selected range inside `host`, or null when there is no range to
 * style.
 *
 * Null for a collapsed caret on purpose: styling nothing is not an
 * operation, and a panel that acted on a caret would restyle whatever
 * the user last selected the moment they clicked away.
 */
export const selectionOffsetsWithin = (host, selection) => {
    if (selection === null || selection.rangeCount === 0)
        return null;
    if (selection.isCollapsed)
        return null;
    const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
    if (anchorNode === null || focusNode === null)
        return null;
    if (!host.contains(anchorNode) || !host.contains(focusNode))
        return null;
    const a = offsetOf(host, anchorNode, anchorOffset);
    const b = offsetOf(host, focusNode, focusOffset);
    if (a === null || b === null)
        return null;
    // Selecting right-to-left puts the focus before the anchor, and a
    // backwards range is not something the run operations should have to
    // think about.
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    return start === end ? null : { start, end };
};
