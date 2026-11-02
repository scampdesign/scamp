/**
 * Patch `from` to match `to` in place: attributes, text, and children, matched
 * by position and checked by tag and first class. A node that doesn't match is
 * replaced whole. see docs/notes/iframe-canvas.md
 *
 * Checks `nodeType`, never `instanceof`: the nodes live in the iframe's own
 * window, whose `Element` is not this window's.
 */
const isElement = (node) => node.nodeType === Node.ELEMENT_NODE;
const keyOf = (node) => isElement(node) ? `${node.tagName}.${node.classList[0] ?? ''}` : `#${node.nodeType}`;
export const morphDom = (from, to) => {
    const doc = from.ownerDocument;
    for (const { name } of Array.from(from.attributes)) {
        if (!to.hasAttribute(name))
            from.removeAttribute(name);
    }
    for (const { name, value } of Array.from(to.attributes)) {
        if (from.getAttribute(name) !== value)
            from.setAttribute(name, value);
    }
    const current = Array.from(from.childNodes);
    const next = Array.from(to.childNodes);
    next.forEach((target, i) => {
        const node = current[i];
        if (node === undefined) {
            from.appendChild(doc.importNode(target, true));
        }
        else if (keyOf(node) !== keyOf(target)) {
            from.replaceChild(doc.importNode(target, true), node);
        }
        else if (isElement(node) && isElement(target)) {
            morphDom(node, target);
        }
        else if (node.nodeValue !== target.nodeValue) {
            node.nodeValue = target.nodeValue;
        }
    });
    for (const extra of current.slice(next.length))
        from.removeChild(extra);
};
