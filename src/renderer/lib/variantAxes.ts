import {
  ROOT_ELEMENT_ID,
  variantKey,
  type BreakpointOverride,
  type ElementStateName,
  type ScampElement,
  type VariantAxis,
  type VariantOverride,
} from './element';
import { collectViewProps } from './viewProps';

/**
 * Edits to a component's variant axes: the root's `variantAxes`, the
 * `data-<prop>` binding that carries each one, and the overrides keyed by
 * its values on every element. CONTRACT.md §1.3.1, and
 * docs/plans/component-variants-plan.md
 */

type Elements = Record<string, ScampElement>;

/** A value is written as a CSS attribute value and a TS string literal. */
const VALUE_RE = /^[a-z][a-z0-9-]*$/;
/** An axis is a prop name and a `data-` attribute suffix. */
const PROP_RE = /^[a-z][a-zA-Z0-9]*$/;

export const axesOf = (elements: Elements): ReadonlyArray<VariantAxis> =>
  elements[ROOT_ELEMENT_ID]?.variantAxes ?? [];

export const parseVariantKey = (key: string): { axis: string; value: string } | null => {
  const at = key.indexOf('=');
  if (at <= 0 || at === key.length - 1) return null;
  return { axis: key.slice(0, at), value: key.slice(at + 1) };
};

/** True when `key` names a non-default value of a declared axis. */
export const isVariantKeyLive = (elements: Elements, key: string): boolean => {
  const parsed = parseVariantKey(key);
  if (parsed === null) return false;
  const axis = axesOf(elements).find((a) => a.prop === parsed.axis);
  return axis !== undefined && axis.values.includes(parsed.value) && axis.defaultValue !== parsed.value;
};

/** Why `name` can't be a new value on `axis`, or null when it can. */
export const variantValueError = (axis: VariantAxis, name: string, renaming: string | null = null): string | null => {
  if (!VALUE_RE.test(name)) return 'Use lowercase letters, digits, and hyphens, starting with a letter.';
  if (name !== renaming && axis.values.includes(name)) return `${axis.prop} already has a value named ${name}.`;
  return null;
};

/** Why `name` can't be a new axis, or null when it can. */
export const variantAxisError = (elements: Elements, name: string, renaming: string | null = null): string | null => {
  if (!PROP_RE.test(name)) return 'Use letters and digits, starting with a lowercase letter.';
  if (name === renaming) return null;
  if (name === 'className' || name === 'children') return `${name} is reserved.`;
  if (collectViewProps(elements, ROOT_ELEMENT_ID).some((p) => p.name === name)) return `The component already has a prop named ${name}.`;
  return null;
};

/** A name not yet on the axis: `variant-2`, `variant-3`, … */
export const nextValueName = (axis: VariantAxis): string => {
  for (let n = axis.values.length + 1; ; n += 1) {
    const name = `${axis.prop.toLowerCase()}-${n}`;
    if (!axis.values.includes(name)) return name;
  }
};

const withRoot = (elements: Elements, patch: (root: ScampElement) => ScampElement): Elements => {
  const root = elements[ROOT_ELEMENT_ID];
  return root === undefined ? elements : { ...elements, [ROOT_ELEMENT_ID]: patch(root) };
};

const replaceAxis = (root: ScampElement, prop: string, next: VariantAxis | null): ScampElement => {
  const axes = (root.variantAxes ?? []).flatMap((a) => (a.prop !== prop ? [a] : next === null ? [] : [next]));
  const { variantAxes: _drop, ...rest } = root;
  return axes.length > 0 ? { ...rest, variantAxes: axes } : rest;
};

/** Rewrite every element's override map; an empty map is dropped. */
const mapOverrides = (
  elements: Elements,
  fn: (overrides: Record<string, VariantOverride>) => Record<string, VariantOverride>
): Elements => {
  const next: Elements = {};
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

const renameKeys = (
  overrides: Record<string, VariantOverride>,
  rename: (key: string) => string | null
): Record<string, VariantOverride> => {
  const out: Record<string, VariantOverride> = {};
  for (const [key, value] of Object.entries(overrides)) {
    const to = rename(key);
    if (to !== null) out[to] = value;
  }
  return out;
};

const withoutKey = (record: Record<string, string> | undefined, key: string): Record<string, string> | undefined => {
  if (record === undefined || !(key in record)) return record;
  const { [key]: _drop, ...rest } = record;
  return Object.keys(rest).length > 0 ? rest : undefined;
};

const setOptional = (
  el: ScampElement,
  field: 'bind' | 'attributes',
  value: Record<string, string> | undefined
): ScampElement => {
  const next = { ...el };
  if (value === undefined) delete next[field];
  else next[field] = value;
  return next;
};

/** Add an axis bound as `data-<prop>={<prop>}` on the root. */
export const addVariantAxis = (elements: Elements, axis: VariantAxis): Elements => {
  if (variantAxisError(elements, axis.prop) !== null || !axis.values.includes(axis.defaultValue)) return elements;
  const attr = `data-${axis.prop}`;
  return withRoot(elements, (root) => ({
    ...root,
    variantAxes: [...(root.variantAxes ?? []), axis],
    bind: { ...root.bind, [attr]: axis.prop },
    attributes: { ...root.attributes, [attr]: axis.defaultValue },
  }));
};

/** Remove an axis, its binding, and every override for its values. */
export const removeVariantAxis = (elements: Elements, prop: string): Elements => {
  if (!axesOf(elements).some((a) => a.prop === prop)) return elements;
  const attr = `data-${prop}`;
  const prefix = `${prop}=`;
  const cleared = withRoot(elements, (root) => {
    const dropped = replaceAxis(root, prop, null);
    return setOptional(setOptional(dropped, 'bind', withoutKey(dropped.bind, attr)), 'attributes', withoutKey(dropped.attributes, attr));
  });
  return mapOverrides(cleared, (o) => renameKeys(o, (k) => (k.startsWith(prefix) ? null : k)));
};

export const renameVariantAxis = (elements: Elements, from: string, to: string): Elements => {
  const axis = axesOf(elements).find((a) => a.prop === from);
  if (axis === undefined || from === to || variantAxisError(elements, to) !== null) return elements;
  const fromAttr = `data-${from}`;
  const toAttr = `data-${to}`;
  const renamed = withRoot(elements, (root) => {
    const next = replaceAxis(root, from, { ...axis, prop: to });
    const { [fromAttr]: _bind, ...bind } = next.bind ?? {};
    const { [fromAttr]: _attr, ...attributes } = next.attributes ?? {};
    return { ...next, bind: { ...bind, [toAttr]: to }, attributes: { ...attributes, [toAttr]: axis.defaultValue } };
  });
  const prefix = `${from}=`;
  return mapOverrides(renamed, (o) => renameKeys(o, (k) => (k.startsWith(prefix) ? `${to}=${k.slice(prefix.length)}` : k)));
};

/**
 * Add a value. With `copyFrom`, the new value starts as a copy of that
 * value's look; without it, as the default look.
 */
export const addVariantValue = (elements: Elements, prop: string, value: string, copyFrom: string | null): Elements => {
  const axis = axesOf(elements).find((a) => a.prop === prop);
  if (axis === undefined || variantValueError(axis, value) !== null) return elements;
  const added = withRoot(elements, (root) => replaceAxis(root, prop, { ...axis, values: [...axis.values, value] }));
  if (copyFrom === null || copyFrom === axis.defaultValue) return added;
  const source = variantKey(prop, copyFrom);
  const target = variantKey(prop, value);
  return mapOverrides(added, (o) => {
    const copy = o[source];
    return copy === undefined ? o : { ...o, [target]: structuredClone(copy) };
  });
};

export const renameVariantValue = (elements: Elements, prop: string, from: string, to: string): Elements => {
  const axis = axesOf(elements).find((a) => a.prop === prop);
  if (axis === undefined || !axis.values.includes(from) || variantValueError(axis, to, from) !== null || from === to) return elements;
  const isDefault = axis.defaultValue === from;
  const renamed = withRoot(elements, (root) => {
    const next = replaceAxis(root, prop, {
      ...axis,
      values: axis.values.map((v) => (v === from ? to : v)),
      defaultValue: isDefault ? to : axis.defaultValue,
    });
    return isDefault ? { ...next, attributes: { ...next.attributes, [`data-${prop}`]: to } } : next;
  });
  const fromKey = variantKey(prop, from);
  const toKey = variantKey(prop, to);
  return mapOverrides(renamed, (o) => renameKeys(o, (k) => (k === fromKey ? toKey : k)));
};

/** Remove a non-default value and its overrides. The default can't be removed. */
export const removeVariantValue = (elements: Elements, prop: string, value: string): Elements => {
  const axis = axesOf(elements).find((a) => a.prop === prop);
  if (axis === undefined || axis.defaultValue === value || !axis.values.includes(value)) return elements;
  const removed = withRoot(elements, (root) =>
    replaceAxis(root, prop, { ...axis, values: axis.values.filter((v) => v !== value) })
  );
  const key = variantKey(prop, value);
  return mapOverrides(removed, (o) => renameKeys(o, (k) => (k === key ? null : k)));
};

/** The fields `key` (and `state` within it) overrides on `el`. */
export const variantOverrideFields = (
  el: ScampElement | undefined,
  key: string,
  state: ElementStateName | null
): Array<keyof BreakpointOverride> => {
  const override = el?.variantOverrides?.[key];
  const target = state === null ? override : override?.states?.[state];
  return Object.keys(target ?? {}).filter((k) => k !== 'states') as Array<keyof BreakpointOverride>;
};

/** Drop `fields` from `el`'s override for `key` (or its `state`), pruning empty maps. */
export const resetVariantFields = (
  el: ScampElement,
  key: string,
  state: ElementStateName | null,
  fields: ReadonlyArray<keyof BreakpointOverride>
): ScampElement => {
  const existing = el.variantOverrides?.[key];
  if (existing === undefined) return el;
  let next: VariantOverride;
  if (state === null) {
    next = { ...existing };
    for (const field of fields) delete next[field];
  } else {
    const stateOverride: BreakpointOverride = { ...existing.states?.[state] };
    for (const field of fields) delete stateOverride[field];
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
