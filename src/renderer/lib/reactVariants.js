// @lib/reactVariants.ts — the looks a React component's copies differ in, as variants.
//
// The React import makes one Scamp component of a component's copies and
// draws it in their commonest look. A copy that differs only in paint (the
// selected nav item, an outline button) used to lose its look. Here each
// distinct paint becomes a value on one variant axis, named from the React
// prop that tells the copies apart when one does, and each instance picks
// its own. Pure. see docs/plans/component-variants-plan.md
import { VARIANT_VALUE_RE } from './element';
/** Fields that only paint: they change how an element looks, not where anything goes. */
export const PAINT_FIELDS = [
    'backgroundColor',
    'borderColor',
    'color',
    'opacity',
    'fontWeight',
    'fill',
    'stroke',
    'boxShadows',
    'boxShadowToken',
];
export const PAINT_CSS = new Set([
    'color',
    'background',
    'background-color',
    'background-image',
    'border-color',
    'box-shadow',
    'opacity',
    'font-weight',
    'outline',
    'outline-color',
    'text-decoration-line',
    'text-decoration-color',
    'filter',
    'cursor',
    'transition',
    '-webkit-text-fill-color',
]);
/** More looks than this is a component styled per page, not a set of variants. */
export const MAX_VARIANT_VALUES = 4;
/**
 * What `el` paints differently from `look`. A paint the look has and the
 * copy lacks can't be unset by an override, so it isn't carried.
 */
// shortcut: a paint only the common look has stays on every value; write `none`/`transparent` overrides when an import shows one.
export const paintOverride = (el, look) => {
    const out = {};
    for (const key of PAINT_FIELDS) {
        const value = el[key];
        if (value !== undefined && JSON.stringify(value) !== JSON.stringify(look[key]))
            Object.assign(out, { [key]: value });
    }
    const custom = {};
    for (const [prop, value] of Object.entries(el.customProperties)) {
        if (PAINT_CSS.has(prop) && look.customProperties[prop] !== value)
            custom[prop] = value;
    }
    if (Object.keys(custom).length > 0)
        out.customProperties = custom;
    return out;
};
const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;
/** A string as a variant value: lowercase words joined by hyphens. */
export const slugValue = (raw) => {
    const slug = raw
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (slug === '')
        return '';
    return /^[a-z]/.test(slug) ? slug : `v-${slug}`;
};
/** `isActive` → `active`: a boolean prop names the look it turns on. */
const booleanValue = (prop) => slugValue(prop.replace(/^(is|has)(?=[A-Z])/, ''));
/** Each group's value from a React prop every copy in it agrees on, or null. */
const namesFromProp = (groups, copies, takenProps) => {
    const candidates = [...new Set(copies.flatMap((c) => Object.keys(c.props)))]
        .filter((p) => !takenProps.has(p))
        .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    for (const prop of candidates) {
        const values = [];
        for (const group of groups) {
            const seen = new Set(group.copies.map((i) => JSON.stringify(copies[i]?.props[prop] ?? null)));
            if (seen.size !== 1)
                break;
            const raw = copies[group.copies[0]]?.props[prop];
            const value = typeof raw === 'boolean' ? (raw ? booleanValue(prop) : 'default') : raw === undefined ? 'default' : slugValue(String(raw));
            values.push(value);
        }
        if (values.length === groups.length && distinctValid(values)) {
            const typed = copies.map((c) => c.props[prop]).find((v) => v !== undefined);
            // A string prop is the axis itself; a flag only names the looks it turns on.
            const axis = typeof typed === 'string' && IDENTIFIER.test(prop) ? prop : 'variant';
            return { prop: axis, values };
        }
    }
    return null;
};
const rank = (prop) => (prop === 'variant' ? 0 : prop === 'state' ? 1 : 2);
const distinctValid = (values) => new Set(values).size === values.length && values.every((v) => VARIANT_VALUE_RE.test(v));
/**
 * Plan the variants a component's copies need, given the common look at
 * each position. Null when no copy paints differently from it.
 */
export const planReactVariants = (copies, look, 
/** Prop names the component already has, such as its text props. */
takenProps = new Set()) => {
    const perCopy = copies.map((copy) => {
        const at = {};
        look.forEach((common, p) => {
            const el = copy.elements[p];
            if (el === undefined)
                return;
            const override = paintOverride(el, common);
            if (Object.keys(override).length > 0)
                at[p] = override;
        });
        return at;
    });
    const groups = [];
    perCopy.forEach((at, i) => {
        const key = JSON.stringify(at);
        const group = groups.find((g) => g.key === key);
        if (group === undefined)
            groups.push({ key, copies: [i] });
        else
            group.copies.push(i);
    });
    const baseIndex = groups.findIndex((g) => g.key === '{}');
    const looks = groups.length - (baseIndex === -1 ? 0 : 1);
    if (looks === 0)
        return null;
    if (looks > MAX_VARIANT_VALUES)
        return { kind: 'too-many', looks };
    // The base look first, so its name is the default.
    const ordered = baseIndex === -1 ? groups : [groups[baseIndex], ...groups.filter((_, i) => i !== baseIndex)];
    const hasBase = baseIndex !== -1;
    let prop = 'variant';
    let values = null;
    let named = 'number';
    const fromProp = namesFromProp(ordered, copies, takenProps);
    if (fromProp !== null) {
        ({ prop, values } = fromProp);
        named = 'prop';
    }
    else {
        // The selected nav item, one per page: each look is the page it's on.
        const views = ordered.map((g) => new Set(g.copies.map((i) => copies[i]?.view ?? '')));
        const byView = ordered.map((g, i) => (hasBase && i === 0 ? 'default' : slugValue(copies[g.copies[0]]?.view ?? '')));
        if (views.every((v, i) => (hasBase && i === 0) || v.size === 1) && distinctValid(byView)) {
            values = byView;
            named = 'view';
        }
    }
    values ??= ordered.map((_, i) => (i === 0 && hasBase ? 'default' : `variant-${i + 1}`));
    // With no copy in the base look, the default is still the common look,
    // which no copy picks. It needs a name the others don't use.
    const defaultValue = hasBase ? values[0] : values.includes('default') ? 'base' : 'default';
    const lookValues = hasBase ? values.slice(1) : values;
    const copyValues = new Array(copies.length).fill(defaultValue);
    const overrides = {};
    (hasBase ? ordered.slice(1) : ordered).forEach((group, i) => {
        const value = lookValues[i];
        for (const c of group.copies)
            copyValues[c] = value;
        overrides[value] = perCopy[group.copies[0]] ?? {};
    });
    return {
        kind: 'variants',
        axis: { prop, values: [defaultValue, ...lookValues], defaultValue },
        copyValues,
        overrides,
        named,
    };
};
