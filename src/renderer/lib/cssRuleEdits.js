import postcss from 'postcss';
import { isTableRuleSelector } from './tableStyle';
/** postcss keeps the author's spacing inside selectors and params. */
const norm = (text) => text.trim().replace(/\s+/g, ' ');
const slotKey = (slot) => {
    if (slot.kind === 'rule')
        return `rule:${norm(slot.selector)}`;
    if (slot.kind === 'ruleInMedia')
        return `media:${norm(slot.media)}|${norm(slot.selector)}`;
    return `at:${norm(slot.key)}`;
};
const atRuleKey = (at) => `@${at.name} ${norm(at.params)}`;
/**
 * A rule's declarations as text, without the selector or braces, and
 * valid CSS on their own. postcss stringifies a declaration without its
 * terminator, so re-parsing a multi-declaration body needs them put
 * back or it fails on the second line.
 */
const bodyOf = (rule) => (rule.nodes ?? [])
    .map((node) => (node.type === 'decl' ? `${node.toString().trim()};` : node.toString().trim()))
    .join('\n');
/**
 * A container's declarations reduced to what they MEAN, so two rules
 * that say the same thing compare equal however they were written:
 * `.a{color:red}` and `.a {\n  color: red;\n}` are the same rule.
 * Comments are dropped, so a comment inside a rule is not a reason to
 * rewrite it — nor is it lost, because nothing is then written.
 */
const canonicalParts = (container) => (container.nodes ?? []).flatMap((node) => {
    if (node.type === 'decl') {
        return [`${norm(node.prop)}:${norm(node.value)}${node.important ? '!important' : ''}`];
    }
    if (node.type === 'rule') {
        return [`${norm(node.selector)}{${canonicalParts(node).join(';')}}`];
    }
    if (node.type === 'atrule') {
        return [`@${node.name} ${norm(node.params)}{${canonicalParts(node).join(';')}}`];
    }
    return [];
});
/**
 * Whether two rule bodies say the same thing.
 *
 * Declaration ORDER is ignored while every property appears once,
 * because `width` before `position` renders the same as the other way
 * round, and reordering someone's rule is exactly the gratuitous
 * rewrite this change exists to avoid. When a property repeats, order
 * decides which value wins, so the comparison becomes strict again.
 */
const bodiesAgree = (a, b) => {
    if (a.length !== b.length)
        return false;
    const repeats = (parts) => new Set(parts.map((part) => part.slice(0, part.indexOf(':')))).size !== parts.length;
    if (repeats(a) || repeats(b))
        return a.join(';') === b.join(';');
    return [...a].sort().join(';') === [...b].sort().join(';');
};
/**
 * Whether a slot is one the generator emits, and so one whose absence
 * from a freshly generated stylesheet means the user deleted it.
 *
 * Everything else on disk — `:root`, `html`, `@font-face`, `@import`,
 * an `@supports` block someone wrote by hand — is left alone. Scamp
 * does not emit those, so their absence says nothing about intent, and
 * removing them would be exactly the data loss this change exists to
 * stop.
 */
const isGenerated = (slot) => {
    if (slot.kind === 'atRule')
        return norm(slot.key).startsWith('@keyframes ');
    const selector = slot.kind === 'rule' ? slot.selector : slot.selector;
    // A table's derived rules start with `:where(` but are Scamp's: left
    // behind, a stripe switched off would be read back on the next parse.
    return norm(selector).startsWith('.') || isTableRuleSelector(selector);
};
/**
 * Every addressable slot in a stylesheet, in source order. A `@media`
 * contributes its inner rules rather than itself, so two stylesheets
 * that differ in one breakpoint rule produce one change and not a
 * rewritten block. Every other at-rule is one slot, compared whole.
 */
export const cssSlots = (css) => {
    let root;
    try {
        root = postcss.parse(css);
    }
    catch {
        return [];
    }
    const out = [];
    for (const node of root.nodes ?? []) {
        if (node.type === 'rule') {
            out.push({
                slot: { kind: 'rule', selector: node.selector },
                body: bodyOf(node),
                canonical: canonicalParts(node),
            });
            continue;
        }
        if (node.type !== 'atrule')
            continue;
        const at = node;
        if (at.name !== 'media') {
            out.push({
                slot: { kind: 'atRule', key: atRuleKey(at) },
                body: bodyOf(at),
                canonical: canonicalParts(at),
            });
            continue;
        }
        for (const inner of at.nodes ?? []) {
            if (inner.type !== 'rule')
                continue;
            out.push({
                slot: { kind: 'ruleInMedia', media: at.params, selector: inner.selector },
                body: bodyOf(inner),
                canonical: canonicalParts(inner),
            });
        }
    }
    return out;
};
/**
 * What to change in `base` so its rules say what `next` says. Slots
 * present in both with identical declarations produce nothing, which is
 * the whole point: an untouched rule is never rewritten.
 *
 * `base` is the file on disk and `next` is freshly generated, so a
 * difference in formatting alone still shows up as a change for that
 * one rule. Whitespace inside a declaration list is normalised away
 * first, so re-indentation on its own is not a change.
 */
export const cssRuleChanges = (base, next) => {
    const baseSlots = cssSlots(base);
    const nextSlots = cssSlots(next);
    const baseByKey = new Map(baseSlots.map((entry) => [slotKey(entry.slot), entry]));
    const nextByKey = new Map(nextSlots.map((entry) => [slotKey(entry.slot), entry]));
    const changes = [];
    for (const entry of nextSlots) {
        const existing = baseByKey.get(slotKey(entry.slot));
        if (existing === undefined || !bodiesAgree(existing.canonical, entry.canonical)) {
            changes.push({ op: 'set', slot: entry.slot, body: entry.body });
        }
    }
    for (const entry of baseSlots) {
        if (!nextByKey.has(slotKey(entry.slot)) && isGenerated(entry.slot)) {
            changes.push({ op: 'remove', slot: entry.slot });
        }
    }
    return changes;
};
const findRule = (container, selector) => {
    for (const node of container.nodes ?? []) {
        if (node.type === 'rule' && norm(node.selector) === norm(selector))
            return node;
    }
    return null;
};
const findMedia = (root, params) => {
    for (const node of root.nodes ?? []) {
        if (node.type === 'atrule' && node.name === 'media' && norm(node.params) === norm(params)) {
            return node;
        }
    }
    return null;
};
const findAtRule = (root, key) => {
    for (const node of root.nodes ?? []) {
        if (node.type === 'atrule' && atRuleKey(node) === norm(key))
            return node;
    }
    return null;
};
/**
 * Replace a container's declarations, keeping the whitespace the file
 * already used. postcss carries each node's leading whitespace in
 * `raws.before`, so a rule indented with four spaces keeps its four
 * spaces instead of picking up the generator's two.
 */
const setBody = (container, body, indent = '\n  ') => {
    const existing = container.nodes ?? [];
    const before = existing[0]?.raws.before ?? indent;
    const after = container.raws.after;
    container.removeAll();
    if (body.trim().length === 0)
        return;
    const parsed = postcss.parse(`x{${body}}`).first;
    if (parsed === undefined || parsed.type !== 'rule')
        return;
    for (const node of parsed.nodes ?? []) {
        const clone = node.clone();
        clone.raws.before = before;
        container.append(clone);
    }
    if (after !== undefined)
        container.raws.after = after;
};
/**
 * A rule that is not on disk yet, indented the way the generator writes
 * it. Parsing the body straight after the brace left every declaration
 * at column zero. `margin` is the rule's own indent inside a `@media`.
 */
const newRule = (selector, body, margin) => {
    const rule = postcss.rule({ selector });
    setBody(rule, body, `\n${margin}  `);
    rule.raws.after = `\n${margin}`;
    // postcss borrows the leading space from a sibling, and a new block has none.
    rule.raws.before = `\n${margin}`;
    return rule;
};
/**
 * Apply changes to a stylesheet. A slot that exists is rewritten in
 * place; a new one is inserted where `order` says it belongs, next to
 * a neighbour that already exists, so a new element's rule doesn't land
 * at the bottom of the file. `order` is the generated stylesheet the
 * changes came from.
 */
export const applyCssChanges = (source, changes, order) => {
    if (changes.length === 0)
        return source;
    let root;
    try {
        root = postcss.parse(source);
    }
    catch {
        // An unparseable stylesheet is not something to patch blind.
        throw new Error('The stylesheet on disk could not be parsed.');
    }
    const wanted = cssSlots(order).map((entry) => slotKey(entry.slot));
    /** Insert `node` into `container` at the position `order` implies. */
    const insertInOrder = (container, node, key) => {
        const index = wanted.indexOf(key);
        const existingKeys = new Map();
        for (const child of container.nodes ?? []) {
            if (child.type === 'rule') {
                existingKeys.set(container.type === 'atrule'
                    ? slotKey({
                        kind: 'ruleInMedia',
                        media: container.params,
                        selector: child.selector,
                    })
                    : slotKey({ kind: 'rule', selector: child.selector }), child);
            }
            else if (child.type === 'atrule' && child.name !== 'media') {
                existingKeys.set(slotKey({ kind: 'atRule', key: atRuleKey(child) }), child);
            }
        }
        // The nearest slot before this one that the file already has.
        for (let i = index - 1; i >= 0; i -= 1) {
            const before = existingKeys.get(wanted[i] ?? '');
            if (before !== undefined) {
                before.after(node);
                return;
            }
        }
        // Nothing before it exists: put it first if something after it does,
        // otherwise at the end.
        for (let i = index + 1; i < wanted.length; i += 1) {
            const after = existingKeys.get(wanted[i] ?? '');
            if (after !== undefined) {
                after.before(node);
                return;
            }
        }
        container.append(node);
    };
    for (const change of changes) {
        const { slot } = change;
        if (slot.kind === 'rule') {
            const existing = findRule(root, slot.selector);
            if (change.op === 'remove') {
                existing?.remove();
                continue;
            }
            if (existing) {
                setBody(existing, change.body);
                continue;
            }
            insertInOrder(root, newRule(slot.selector, change.body, ''), slotKey(slot));
            continue;
        }
        if (slot.kind === 'ruleInMedia') {
            const media = findMedia(root, slot.media);
            if (change.op === 'remove') {
                const existing = media ? findRule(media, slot.selector) : null;
                existing?.remove();
                // A breakpoint block with nothing left in it is scaffolding.
                if (media && (media.nodes ?? []).length === 0)
                    media.remove();
                continue;
            }
            const container = media ??
                (() => {
                    const created = postcss.parse(`@media ${slot.media} {}`).first;
                    // On its own lines, as the generator writes it.
                    created.raws.before = '\n';
                    created.raws.after = '\n';
                    root.append(created);
                    return created;
                })();
            const existing = findRule(container, slot.selector);
            if (existing) {
                setBody(existing, change.body);
                continue;
            }
            insertInOrder(container, newRule(slot.selector, change.body, '  '), slotKey(slot));
            continue;
        }
        const existing = findAtRule(root, slot.key);
        if (change.op === 'remove') {
            existing?.remove();
            continue;
        }
        if (existing) {
            setBody(existing, change.body);
            continue;
        }
        const created = postcss.parse(`${slot.key} {\n${change.body}\n}`).first;
        if (created && created.type === 'atrule') {
            insertInOrder(root, created, slotKey(slot));
        }
    }
    return root.toString();
};
