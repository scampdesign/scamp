import { ROOT_ELEMENT_ID, VARIANT_AXIS_RE, VARIANT_VALUE_RE, } from './element';
/** The triggers CSS expresses, and the pseudo-class each puts on the root. */
export const TRIGGER_PSEUDO = {
    hover: ':hover',
    press: ':active',
    focus: ':focus-visible',
};
export const isCssTrigger = (trigger) => trigger === 'hover' || trigger === 'press' || trigger === 'focus';
/** The attribute each remembered trigger is written as. */
const TRIGGER_ATTRIBUTE = {
    click: 'data-scamp-click',
    outside: 'data-scamp-outside',
    escape: 'data-scamp-escape',
};
export const TRIGGER_LABEL = {
    hover: 'While hovering',
    press: 'While pressing',
    focus: 'While focused',
    click: 'On click',
    outside: 'On click outside',
    escape: 'On Escape',
};
export const interactionsOf = (elements) => elements[ROOT_ELEMENT_ID]?.variantInteractions ?? [];
/**
 * The second selectors a variant rule gains, one per CSS interaction
 * whose `to` is one of its values: that value swapped for `from`, or for
 * any value (`[data-state]`, which keeps the selector as specific as the
 * other values' rules it has to beat), with the trigger's pseudo-class on
 * the root.
 * `rest` is everything after the root's attributes (` .label_c1a1:hover`).
 */
export const aliasSelectors = (rootClass, parts, rest, interactions) => {
    const out = [];
    for (const i of interactions) {
        if (!isCssTrigger(i.trigger))
            continue;
        if (!parts.some((p) => p.axis === i.axis && p.value === i.to))
            continue;
        const attrs = parts
            .map((p) => p.axis !== i.axis ? `[data-${p.axis}="${p.value}"]` : i.from === null ? `[data-${p.axis}]` : `[data-${p.axis}="${i.from}"]`)
            .join('');
        out.push(`.${rootClass}${attrs}${TRIGGER_PSEUDO[i.trigger]}${rest}`);
    }
    return out;
};
/** `state:closed=open,open=closed tab:*=one`, axes in first-seen order. */
const serialize = (interactions) => {
    const groups = new Map();
    for (const i of interactions)
        groups.set(i.axis, [...(groups.get(i.axis) ?? []), `${i.from ?? '*'}=${i.to}`]);
    return [...groups].map(([axis, pairs]) => `${axis}:${pairs.join(',')}`).join(' ');
};
/** Read an attribute's interactions, or null when any part is malformed. */
const deserialize = (value, trigger, target) => {
    const out = [];
    for (const group of value.trim().split(/\s+/)) {
        const at = group.indexOf(':');
        const axis = group.slice(0, at);
        if (at <= 0 || !VARIANT_AXIS_RE.test(axis))
            return null;
        for (const pair of group.slice(at + 1).split(',')) {
            const [from = '', to = '', ...extra] = pair.split('=');
            if (extra.length > 0 || !VARIANT_VALUE_RE.test(to) || (from !== '*' && !VARIANT_VALUE_RE.test(from)))
                return null;
            out.push({ axis, from: from === '*' ? null : from, trigger, to, ...(target !== undefined ? { target } : {}) });
        }
    }
    return out.length > 0 ? out : null;
};
/**
 * The elements as the TSX writes them: each remembered interaction as a
 * `data-scamp-*` attribute, click on its target (the root by default),
 * outside and Escape on the root.
 */
export const withInteractionAttributes = (elements) => {
    const interactions = interactionsOf(elements).filter((i) => !isCssTrigger(i.trigger));
    if (interactions.length === 0)
        return elements;
    const byElement = new Map();
    for (const i of interactions) {
        const id = i.trigger === 'click' ? (i.target ?? ROOT_ELEMENT_ID) : ROOT_ELEMENT_ID;
        if (elements[id] === undefined)
            continue;
        const attr = TRIGGER_ATTRIBUTE[i.trigger];
        const forElement = byElement.get(id) ?? new Map();
        forElement.set(attr, [...(forElement.get(attr) ?? []), i]);
        byElement.set(id, forElement);
    }
    const next = { ...elements };
    for (const [id, attrs] of byElement) {
        const el = next[id];
        const added = Object.fromEntries([...attrs].map(([attr, list]) => [attr, serialize(list)]));
        next[id] = { ...el, attributes: { ...el.attributes, ...added } };
    }
    return next;
};
/**
 * Take the `data-scamp-*` attributes off the elements and back into
 * interactions. A malformed one stays as an ordinary attribute, verbatim.
 */
export const readInteractionAttributes = (elements) => {
    const interactions = [];
    const next = {};
    for (const [id, el] of Object.entries(elements)) {
        let attributes = el.attributes;
        for (const [trigger, attr] of Object.entries(TRIGGER_ATTRIBUTE)) {
            const value = attributes?.[attr];
            if (value === undefined)
                continue;
            // Outside and Escape belong on the root; elsewhere they're someone else's attribute.
            if (trigger !== 'click' && id !== ROOT_ELEMENT_ID)
                continue;
            const read = deserialize(value, trigger, trigger === 'click' && id !== ROOT_ELEMENT_ID ? id : undefined);
            if (read === null)
                continue;
            interactions.push(...read);
            const { [attr]: _drop, ...rest } = attributes ?? {};
            attributes = rest;
        }
        if (attributes === el.attributes) {
            next[id] = el;
            continue;
        }
        const { attributes: _old, ...without } = el;
        next[id] = attributes !== undefined && Object.keys(attributes).length > 0 ? { ...without, attributes } : without;
    }
    return { elements: next, interactions };
};
/** Why an interaction can't be added, or null. */
export const interactionError = (axes, i) => {
    const axis = axes.find((a) => a.prop === i.axis);
    if (axis === undefined)
        return `There's no ${i.axis} property.`;
    if (!axis.values.includes(i.to))
        return `${i.axis} has no value named ${i.to}.`;
    if (i.from !== null && !axis.values.includes(i.from))
        return `${i.axis} has no value named ${i.from}.`;
    if (i.from === i.to)
        return 'Choose a different value to change to.';
    // The default's look is the base rules: there's no rule to give a second selector.
    if (isCssTrigger(i.trigger) && i.to === axis.defaultValue) {
        return `${TRIGGER_LABEL[i.trigger]} can't change to the default, ${i.to}. Make another value the default, or use a click.`;
    }
    return null;
};
const setInteractions = (elements, list) => {
    const root = elements[ROOT_ELEMENT_ID];
    if (root === undefined)
        return elements;
    const { variantInteractions: _old, ...rest } = root;
    return { ...elements, [ROOT_ELEMENT_ID]: list.length > 0 ? { ...rest, variantInteractions: list } : rest };
};
/** The same trigger, from the same value, on the same element: one replaces the other. */
const sameInteraction = (a, b) => a.axis === b.axis && a.from === b.from && a.trigger === b.trigger && (a.target ?? null) === (b.target ?? null);
export const addVariantInteraction = (elements, i) => {
    const axes = elements[ROOT_ELEMENT_ID]?.variantAxes ?? [];
    if (interactionError(axes, i) !== null)
        return elements;
    // One interaction per trigger and starting value: a new one replaces it.
    return setInteractions(elements, [...interactionsOf(elements).filter((a) => !sameInteraction(a, i)), i]);
};
export const removeVariantInteraction = (elements, i) => {
    const list = interactionsOf(elements);
    const kept = list.filter((a) => !sameInteraction(a, i) || a.to !== i.to);
    return kept.length === list.length ? elements : setInteractions(elements, kept);
};
/**
 * Keep interactions in step with an axis edit: rename a value or an
 * axis, or drop the ones that name a removed value or axis.
 */
export const mapInteractions = (elements, fn) => {
    const list = interactionsOf(elements);
    if (list.length === 0)
        return elements;
    return setInteractions(elements, list.flatMap((i) => {
        const next = fn(i);
        return next === null ? [] : [next];
    }));
};
/**
 * The values drawn while trying a component: the values it holds, with
 * each hover, press, or focus interaction that applies on top. Press
 * after hover, as a pressed rule comes after a hover one.
 */
export const shownPicks = (picks, interactions, pointer) => {
    const shown = { ...picks };
    for (const trigger of ['hover', 'press', 'focus']) {
        if (!pointer[trigger])
            continue;
        for (const i of interactions) {
            if (i.trigger === trigger && (i.from === null || picks[i.axis] === i.from))
                shown[i.axis] = i.to;
        }
    }
    return shown;
};
/**
 * The values a component holds after a click (on `target`, the root
 * when the click wasn't on one with its own interaction), a click
 * outside it, or Escape. What the scampjs handler does in the browser.
 */
export const afterTrigger = (picks, interactions, trigger, target = ROOT_ELEMENT_ID) => {
    const next = { ...picks };
    for (const i of interactions) {
        if (i.trigger !== trigger)
            continue;
        if (trigger === 'click' && (i.target ?? ROOT_ELEMENT_ID) !== target)
            continue;
        // Each axis moves once per trigger, from the value it held before.
        if (i.from === null || picks[i.axis] === i.from)
            next[i.axis] = i.to;
    }
    return next;
};
