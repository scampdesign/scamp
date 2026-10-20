import { ROOT_ELEMENT_ID, keysCovering, orderedVariantKeys as orderedKeys, variantComboKey, variantKey, variantKeyParts, } from './element';
import { RESERVED_PROP_NAMES, collectViewProps } from './viewProps';
import { resolveElementAtState } from './stateCascade';
import { interactionError, mapInteractions } from './variantInteractions';
/** A value is written as a CSS attribute value and a TS string literal. */
const VALUE_RE = /^[a-z][a-z0-9-]*$/;
/** An axis is a prop name and a `data-` attribute suffix, which CSS matches lowercase. */
const PROP_RE = /^[a-z][a-z0-9]*$/;
/** How many combinations a component's axes may make. Decided for phase 6. */
export const MAX_VARIANT_COMBINATIONS = 36;
/** Every value of every axis, multiplied: the frames the set draws. */
export const variantCombinationCount = (axes) => axes.reduce((count, axis) => count * Math.max(axis.values.length, 1), 1);
/** Why adding `extra` values to an axis (or an axis of `extra` values) is refused, or null. */
export const combinationLimitError = (axes, next) => {
    const count = variantCombinationCount(next);
    if (count <= MAX_VARIANT_COMBINATIONS || count <= variantCombinationCount(axes))
        return null;
    return `That makes ${count} combinations; a component can have up to ${MAX_VARIANT_COMBINATIONS}.`;
};
export const axesOf = (elements) => elements[ROOT_ELEMENT_ID]?.variantAxes ?? [];
export const parseVariantKey = (key) => {
    const at = key.indexOf('=');
    if (at <= 0 || at === key.length - 1)
        return null;
    return { axis: key.slice(0, at), value: key.slice(at + 1) };
};
/**
 * True when `key` names non-default values of declared axes, one per
 * axis, in axis order: a single value or a combination.
 */
export const isVariantKeyLive = (elements, key) => {
    const parts = variantKeyParts(key);
    if (parts === null)
        return false;
    const axes = axesOf(elements);
    let previous = -1;
    for (const part of parts) {
        const index = axes.findIndex((a) => a.prop === part.axis);
        const axis = axes[index];
        if (axis === undefined || index <= previous || !axis.values.includes(part.value) || axis.defaultValue === part.value)
            return false;
        previous = index;
    }
    return true;
};
/**
 * The keys an instance's props reach: each picked value, then each
 * combination of them, in the order their rules are written. The
 * default, and a value the axis lacks, pick nothing.
 */
export const instanceVariantKeys = (axes, propOverrides) => keysCovering(axes.flatMap((axis) => {
    const value = propOverrides?.[axis.prop];
    return value !== undefined && value !== axis.defaultValue && axis.values.includes(value)
        ? [{ axis: axis.prop, value }]
        : [];
}));
/** Rewrite each part of a key; a part mapped to null drops the whole key. */
const mapKeyParts = (key, fn) => {
    const parts = variantKeyParts(key);
    if (parts === null)
        return key;
    const mapped = [];
    for (const part of parts) {
        const next = fn(part.axis, part.value);
        if (next === null)
            return null;
        mapped.push(next);
    }
    return variantComboKey(mapped);
};
/** Why `name` can't be a new value on `axis`, or null when it can. */
export const variantValueError = (axis, name, renaming = null) => {
    if (!VALUE_RE.test(name))
        return 'Use lowercase letters, digits, and hyphens, starting with a letter.';
    if (name !== renaming && axis.values.includes(name))
        return `${axis.prop} already has a value named ${name}.`;
    return null;
};
/** Why `name` can't be a new axis, or null when it can. */
export const variantAxisError = (elements, name, renaming = null) => {
    if (!PROP_RE.test(name))
        return 'Use lowercase letters and digits, starting with a letter.';
    if (name === renaming)
        return null;
    if (RESERVED_PROP_NAMES.has(name))
        return `${name} is reserved by React or JavaScript.`;
    if (collectViewProps(elements, ROOT_ELEMENT_ID).some((p) => p.name === name))
        return `The component already has a prop named ${name}.`;
    return null;
};
/** A name not yet on the axis: `variant-2`, `variant-3`, … */
export const nextValueName = (axis) => {
    for (let n = axis.values.length + 1;; n += 1) {
        const name = `${axis.prop.toLowerCase()}-${n}`;
        if (!axis.values.includes(name))
            return name;
    }
};
const withRoot = (elements, patch) => {
    const root = elements[ROOT_ELEMENT_ID];
    return root === undefined ? elements : { ...elements, [ROOT_ELEMENT_ID]: patch(root) };
};
const replaceAxis = (root, prop, next) => {
    const axes = (root.variantAxes ?? []).flatMap((a) => (a.prop !== prop ? [a] : next === null ? [] : [next]));
    const { variantAxes: _drop, ...rest } = root;
    return axes.length > 0 ? { ...rest, variantAxes: axes } : rest;
};
/** Rewrite every element's override map; an empty map is dropped. */
const mapOverrides = (elements, fn) => {
    const next = {};
    for (const [id, el] of Object.entries(elements)) {
        if (el.variantOverrides === undefined) {
            next[id] = el;
            continue;
        }
        const mapped = fn(el.variantOverrides);
        const { variantOverrides: _drop, ...rest } = el;
        next[id] = Object.keys(mapped).length > 0 ? { ...rest, variantOverrides: mapped } : rest;
    }
    return next;
};
const renameKeys = (overrides, rename) => {
    const out = {};
    for (const [key, value] of Object.entries(overrides)) {
        const to = rename(key);
        if (to !== null)
            out[to] = value;
    }
    return out;
};
const withoutKey = (record, key) => {
    if (record === undefined || !(key in record))
        return record;
    const { [key]: _drop, ...rest } = record;
    return Object.keys(rest).length > 0 ? rest : undefined;
};
const setOptional = (el, field, value) => {
    const next = { ...el };
    if (value === undefined)
        delete next[field];
    else
        next[field] = value;
    return next;
};
/** Add an axis bound as `data-<prop>={<prop>}` on the root. */
export const addVariantAxis = (elements, axis) => {
    if (variantAxisError(elements, axis.prop) !== null || !axis.values.includes(axis.defaultValue))
        return elements;
    if (combinationLimitError(axesOf(elements), [...axesOf(elements), axis]) !== null)
        return elements;
    const attr = `data-${axis.prop}`;
    return withRoot(elements, (root) => ({
        ...root,
        variantAxes: [...(root.variantAxes ?? []), axis],
        bind: { ...root.bind, [attr]: axis.prop },
        attributes: { ...root.attributes, [attr]: axis.defaultValue },
    }));
};
/** Remove an axis, its binding, and every override for its values. */
export const removeVariantAxis = (elements, prop) => {
    if (!axesOf(elements).some((a) => a.prop === prop))
        return elements;
    const attr = `data-${prop}`;
    const cleared = withRoot(elements, (root) => {
        const dropped = replaceAxis(root, prop, null);
        return setOptional(setOptional(dropped, 'bind', withoutKey(dropped.bind, attr)), 'attributes', withoutKey(dropped.attributes, attr));
    });
    const withoutAxis = mapInteractions(cleared, (i) => (i.axis === prop ? null : i));
    return mapOverrides(withoutAxis, (o) => renameKeys(o, (k) => mapKeyParts(k, (axis, value) => (axis === prop ? null : { axis, value }))));
};
export const renameVariantAxis = (elements, from, to) => {
    const axis = axesOf(elements).find((a) => a.prop === from);
    if (axis === undefined || from === to || variantAxisError(elements, to) !== null)
        return elements;
    const fromAttr = `data-${from}`;
    const toAttr = `data-${to}`;
    const renamed = withRoot(elements, (root) => {
        const next = replaceAxis(root, from, { ...axis, prop: to });
        const { [fromAttr]: _bind, ...bind } = next.bind ?? {};
        const { [fromAttr]: _attr, ...attributes } = next.attributes ?? {};
        return { ...next, bind: { ...bind, [toAttr]: to }, attributes: { ...attributes, [toAttr]: axis.defaultValue } };
    });
    const withAxis = mapInteractions(renamed, (i) => (i.axis === from ? { ...i, axis: to } : i));
    return mapOverrides(withAxis, (o) => renameKeys(o, (k) => mapKeyParts(k, (axis, value) => ({ axis: axis === from ? to : axis, value }))));
};
/**
 * Add a value. With `copyFrom`, the new value starts as a copy of that
 * value's look; without it, as the default look.
 */
export const addVariantValue = (elements, prop, value, copyFrom) => {
    const axis = axesOf(elements).find((a) => a.prop === prop);
    if (axis === undefined || variantValueError(axis, value) !== null)
        return elements;
    const grown = axesOf(elements).map((a) => (a.prop === prop ? { ...a, values: [...a.values, value] } : a));
    if (combinationLimitError(axesOf(elements), grown) !== null)
        return elements;
    const added = withRoot(elements, (root) => replaceAxis(root, prop, { ...axis, values: [...axis.values, value] }));
    if (copyFrom === null || copyFrom === axis.defaultValue)
        return added;
    const source = variantKey(prop, copyFrom);
    const target = variantKey(prop, value);
    return mapOverrides(added, (o) => {
        const copy = o[source];
        return copy === undefined ? o : { ...o, [target]: structuredClone(copy) };
    });
};
export const renameVariantValue = (elements, prop, from, to) => {
    const axis = axesOf(elements).find((a) => a.prop === prop);
    if (axis === undefined || !axis.values.includes(from) || variantValueError(axis, to, from) !== null || from === to)
        return elements;
    const isDefault = axis.defaultValue === from;
    const renamed = withRoot(elements, (root) => {
        const next = replaceAxis(root, prop, {
            ...axis,
            values: axis.values.map((v) => (v === from ? to : v)),
            defaultValue: isDefault ? to : axis.defaultValue,
        });
        return isDefault ? { ...next, attributes: { ...next.attributes, [`data-${prop}`]: to } } : next;
    });
    const withValue = mapInteractions(renamed, (i) => i.axis !== prop ? i : { ...i, from: i.from === from ? to : i.from, to: i.to === from ? to : i.to });
    return mapOverrides(withValue, (o) => renameKeys(o, (k) => mapKeyParts(k, (axis, value) => ({ axis, value: axis === prop && value === from ? to : value }))));
};
/** Remove a non-default value and its overrides. The default can't be removed. */
export const removeVariantValue = (elements, prop, value) => {
    const axis = axesOf(elements).find((a) => a.prop === prop);
    if (axis === undefined || axis.defaultValue === value || !axis.values.includes(value))
        return elements;
    const removed = withRoot(elements, (root) => replaceAxis(root, prop, { ...axis, values: axis.values.filter((v) => v !== value) }));
    const withoutValue = mapInteractions(removed, (i) => (i.axis === prop && (i.from === value || i.to === value) ? null : i));
    return mapOverrides(withoutValue, (o) => renameKeys(o, (k) => mapKeyParts(k, (axis, v) => (axis === prop && v === value ? null : { axis, value: v }))));
};
/** The fields `key` (and `state` within it) overrides on `el`. */
export const variantOverrideFields = (el, key, state) => {
    const override = el?.variantOverrides?.[key];
    const target = state === null ? override : override?.states?.[state];
    return Object.keys(target ?? {}).filter((k) => k !== 'states');
};
/** Drop `fields` from `el`'s override for `key` (or its `state`), pruning empty maps. */
export const resetVariantFields = (el, key, state, fields) => {
    const existing = el.variantOverrides?.[key];
    if (existing === undefined)
        return el;
    let next;
    if (state === null) {
        next = { ...existing };
        for (const field of fields)
            delete next[field];
    }
    else {
        const stateOverride = { ...existing.states?.[state] };
        for (const field of fields)
            delete stateOverride[field];
        const { [state]: _drop, ...otherStates } = existing.states ?? {};
        const states = Object.keys(stateOverride).length > 0 ? { ...otherStates, [state]: stateOverride } : otherStates;
        const { states: _old, ...rest } = existing;
        next = Object.keys(states).length > 0 ? { ...rest, states } : rest;
    }
    const { [key]: _key, ...others } = el.variantOverrides ?? {};
    const overrides = Object.keys(next).length > 0 ? { ...others, [key]: next } : others;
    const { variantOverrides: _all, ...rest } = el;
    return Object.keys(overrides).length > 0 ? { ...rest, variantOverrides: overrides } : rest;
};
/** The axis picks a combination key under `axes` stands for: every axis, defaults included. */
const fullPicks = (axes, key) => {
    const picks = Object.fromEntries(axes.map((a) => [a.prop, a.defaultValue]));
    for (const part of key === null ? [] : (variantKeyParts(key) ?? []))
        picks[part.axis] = part.value;
    return picks;
};
/** The key for full picks under `axes`: the values that aren't defaults, or null. */
export const keyFor = (axes, picks) => {
    const parts = axes.filter((a) => picks[a.prop] !== a.defaultValue).map((a) => ({ axis: a.prop, value: picks[a.prop] }));
    return parts.length === 0 ? null : variantComboKey(parts);
};
/** The fields any look of `el` can differ in: those its state and variant overrides touch. */
const lookFields = (el) => {
    const fields = new Set();
    const add = (o) => {
        for (const k of Object.keys(o ?? {}))
            if (k !== 'states')
                fields.add(k);
    };
    for (const o of Object.values(el.stateOverrides ?? {}))
        add(o);
    for (const o of Object.values(el.variantOverrides ?? {})) {
        add(o);
        for (const st of Object.values(o.states ?? {}))
            add(st);
    }
    return fields;
};
/** What `target` sets differently from `lower`, over `fields`. */
// shortcut: a field `lower` has and `target` lacks can't be unset by an override, so it's skipped; rare enough until an import shows one.
const diffLook = (target, lower, fields) => {
    const out = {};
    for (const field of fields) {
        if (field === 'customProperties') {
            const custom = {};
            for (const [k, v] of Object.entries(target.customProperties))
                if (lower.customProperties[k] !== v)
                    custom[k] = v;
            if (Object.keys(custom).length > 0)
                out.customProperties = custom;
            continue;
        }
        const value = target[field];
        if (value !== undefined && JSON.stringify(value) !== JSON.stringify(lower[field]))
            Object.assign(out, { [field]: value });
    }
    return out;
};
/**
 * Make `value` the axis's default, moved to the front of its values, as
 * Figma's top-left variant is. The base rules become that value's look,
 * and every other value and combination is rebuilt so each look is
 * unchanged: each element's look is computed for every combination and
 * state under the old default, then written back as the smallest
 * overrides under the new one.
 */
export const makeVariantDefault = (elements, prop, value) => {
    const oldAxes = axesOf(elements);
    const axis = oldAxes.find((a) => a.prop === prop);
    if (axis === undefined || axis.defaultValue === value || !axis.values.includes(value))
        return elements;
    const newAxes = oldAxes.map((a) => a.prop === prop ? { ...a, defaultValue: value, values: [value, ...a.values.filter((v) => v !== value)] } : a);
    const states = ['hover', 'active', 'focus'];
    const next = {};
    for (const [id, el] of Object.entries(elements)) {
        if (el.variantOverrides === undefined && id !== ROOT_ELEMENT_ID) {
            next[id] = el;
            continue;
        }
        const fields = lookFields(el);
        const look = (newKey, state) => resolveElementAtState(el, 'desktop', [], state, keyFor(oldAxes, fullPicks(newAxes, newKey)));
        const base = look(null, null);
        const { variantOverrides: _old, stateOverrides: _oldStates, ...rest } = el;
        let rebuilt = { ...rest, ...diffLook(base, el, fields) };
        rebuilt = { ...rebuilt, customProperties: { ...el.customProperties, ...base.customProperties } };
        const ownStates = {};
        for (const state of states) {
            const diff = diffLook(look(null, state), base, fields);
            if (Object.keys(diff).length > 0)
                ownStates[state] = diff;
        }
        if (Object.keys(ownStates).length > 0)
            rebuilt = { ...rebuilt, stateOverrides: ownStates };
        const overrides = {};
        for (const key of orderedKeys(newAxes)) {
            const withSoFar = (state) => resolveElementAtState({ ...rebuilt, variantOverrides: overrides }, 'desktop', [], state, key);
            const override = diffLook(look(key, null), withSoFar(null), fields);
            const keyStates = {};
            // The key's own base is in place before its states are diffed.
            overrides[key] = override;
            for (const state of states) {
                const diff = diffLook(look(key, state), withSoFar(state), fields);
                if (Object.keys(diff).length > 0)
                    keyStates[state] = diff;
            }
            if (Object.keys(keyStates).length > 0)
                override.states = keyStates;
            if (Object.keys(override).length === 0)
                delete overrides[key];
        }
        next[id] = Object.keys(overrides).length > 0 ? { ...rebuilt, variantOverrides: overrides } : rebuilt;
    }
    const rebased = withRoot(next, (root) => ({
        ...replaceAxis(root, prop, newAxes.find((a) => a.prop === prop) ?? axis),
        attributes: { ...root.attributes, [`data-${prop}`]: value },
    }));
    // A hover, press, or focus into the new default has no rule left to
    // carry it, so it goes; the others are unchanged.
    return mapInteractions(rebased, (i) => (interactionError(newAxes, i) === null ? i : null));
};
/** Move a value to `toIndex` in its axis. Value order is the grid's and the CSS's. */
export const moveVariantValue = (elements, prop, value, toIndex) => {
    const axis = axesOf(elements).find((a) => a.prop === prop);
    if (axis === undefined || !axis.values.includes(value))
        return elements;
    const rest = axis.values.filter((v) => v !== value);
    const at = Math.max(0, Math.min(toIndex, rest.length));
    const values = [...rest.slice(0, at), value, ...rest.slice(at)];
    if (values.every((v, i) => v === axis.values[i]))
        return elements;
    return withRoot(elements, (root) => replaceAxis(root, prop, { ...axis, values }));
};
/**
 * The variant set's layout, Figma's component set: the first axis down
 * the rows and the second across, in value order; one grid per value of
 * each further axis, stacked. Every combination is a frame.
 */
export const variantGrid = (axes) => {
    if (axes.length === 0)
        return [];
    const [first, second, ...more] = axes;
    const cell = (picks) => {
        const parts = axes.filter((a) => picks[a.prop] !== a.defaultValue).map((a) => ({ axis: a.prop, value: picks[a.prop] }));
        return {
            key: parts.length === 0 ? null : variantComboKey(parts),
            picks,
            label: axes.map((a) => picks[a.prop]).join(' · '),
        };
    };
    let blockPicks = [{}];
    for (const axis of more)
        blockPicks = blockPicks.flatMap((p) => axis.values.map((v) => ({ ...p, [axis.prop]: v })));
    return blockPicks.map((extra) => ({
        heading: more.length === 0 ? null : more.map((a) => `${a.prop}: ${extra[a.prop]}`).join(' · '),
        rows: second === undefined
            ? [first.values.map((v) => cell({ [first.prop]: v }))]
            : first.values.map((row) => second.values.map((col) => cell({ ...extra, [first.prop]: row, [second.prop]: col }))),
    }));
};
