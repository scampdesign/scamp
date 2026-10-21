// @lib/agentVariants.ts — the agent's edits to a component's variant axes and interactions.
//
// The variant helpers return the elements unchanged when an edit can't be
// made; the agent needs to hear why. So each action checks first, says
// what's wrong in a sentence the model can act on, then calls the helper
// the properties panel uses. Pure. see docs/plans/component-variants-plan.md
import { resolveElement } from './agentEdits';
import { VARIANT_VALUE_RE } from './element';
import { classNameFor } from './generateCode';
import { addVariantAxis, addVariantValue, axesOf, combinationLimitError, makeVariantDefault, removeVariantAxis, removeVariantValue, variantAxisError, variantValueError, } from './variantAxes';
import { addVariantInteraction, interactionError, interactionsOf, removeVariantInteraction } from './variantInteractions';
export const VARIANT_ACTIONS = [
    'add_property',
    'remove_property',
    'add_value',
    'remove_value',
    'make_default',
    'add_interaction',
    'remove_interaction',
];
const TRIGGERS = ['hover', 'press', 'focus', 'click', 'outside', 'escape'];
const fail = (error) => ({ ok: false, error });
const str = (value) => (typeof value === 'string' && value.length > 0 ? value : null);
const done = (ctx, elements, summary, notes = []) => ({
    ok: true,
    elements,
    summary,
    touched: [ctx.rootId],
    notes,
});
/** The interaction an add or remove names, or why it can't. */
const readInteraction = (ctx, axis, args) => {
    const trigger = args['trigger'];
    if (typeof trigger !== 'string' || !TRIGGERS.includes(trigger)) {
        return `"trigger" must be one of ${TRIGGERS.join(', ')}.`;
    }
    const to = str(args['to']);
    if (to === null)
        return `"to" names the ${axis.prop} value to change to.`;
    const fromRaw = args['from'] ?? '*';
    if (typeof fromRaw !== 'string' || fromRaw === '')
        return '"from" must be a value, or "*" for any value.';
    const from = fromRaw === '*' ? null : fromRaw;
    const base = { axis: axis.prop, from, trigger: trigger, to };
    if (args['target'] === undefined || args['target'] === null)
        return base;
    if (trigger !== 'click')
        return 'Only a click has a "target"; the other triggers act on the root.';
    const el = resolveElement(ctx, args['target']);
    if (el === null)
        return `No element "${String(args['target'])}". Use an id or class name from scamp_get_element_tree.`;
    return el.id === ctx.rootId ? base : { ...base, target: el.id };
};
const describe = (i, ctx) => {
    const el = i.target === undefined ? undefined : ctx.elements[i.target];
    return `${i.trigger}${el === undefined ? '' : ` on ${classNameFor(el)}`}: ${i.axis} ${i.from ?? 'any'} → ${i.to}`;
};
/**
 * Add, remove, or change a component's variant properties (axes), their
 * values, and its interactions. `property` is the axis; `values` (for a
 * new property) lists its values, the first being the default.
 */
export const editVariants = (ctx, args) => {
    if (!ctx.isComponent)
        return fail('Variants belong to a component. Pass "view" with the component’s name (scamp_list_components).');
    const action = args['action'];
    if (typeof action !== 'string' || !VARIANT_ACTIONS.includes(action)) {
        return fail(`"action" must be one of ${VARIANT_ACTIONS.join(', ')}.`);
    }
    const prop = str(args['property']);
    if (prop === null)
        return fail('"property" names the variant property, e.g. "variant" or "size".');
    const axes = axesOf(ctx.elements);
    if (action === 'add_property') {
        const problem = variantAxisError(ctx.elements, prop);
        if (problem !== null)
            return fail(problem);
        const raw = Array.isArray(args['values']) ? args['values'] : [];
        const values = raw.filter((v) => typeof v === 'string');
        if (values.length < 2 || values.length !== raw.length) {
            return fail('"values" lists two or more value names; the first is the default, e.g. ["default", "outline"].');
        }
        const bad = values.find((v) => !VARIANT_VALUE_RE.test(v));
        if (bad !== undefined)
            return fail(`"${bad}": use lowercase letters, digits, and hyphens, starting with a letter.`);
        if (new Set(values).size !== values.length)
            return fail('Each value must have a different name.');
        const axis = { prop, values, defaultValue: values[0] };
        const limit = combinationLimitError(axes, [...axes, axis]);
        if (limit !== null)
            return fail(limit);
        return done(ctx, addVariantAxis(ctx.elements, axis), `Added the ${prop} property: ${values.join(', ')}`, [
            `${axis.defaultValue} is the default: its look is the elements' own styles. Style each other value with scamp_set_styles and "variant".`,
        ]);
    }
    const axis = axes.find((a) => a.prop === prop);
    if (axis === undefined) {
        const known = axes.map((a) => a.prop).join(', ');
        return fail(`No variant property "${prop}". ${known === '' ? 'This component has none yet; add one with add_property.' : `It has ${known}.`}`);
    }
    const value = str(args['value']);
    const needValue = () => fail(`"value" names a ${prop} value: ${axis.values.join(', ')}.`);
    switch (action) {
        case 'remove_property':
            return done(ctx, removeVariantAxis(ctx.elements, prop), `Removed the ${prop} property and its values' styles`);
        case 'add_value': {
            if (value === null)
                return fail('"value" names the new value.');
            const problem = variantValueError(axis, value);
            if (problem !== null)
                return fail(problem);
            const grown = axes.map((a) => (a.prop === prop ? { ...a, values: [...a.values, value] } : a));
            const limit = combinationLimitError(axes, grown);
            if (limit !== null)
                return fail(limit);
            const copyFrom = str(args['copy_from']);
            if (copyFrom !== null && !axis.values.includes(copyFrom))
                return fail(`"copy_from" must be a ${prop} value: ${axis.values.join(', ')}.`);
            return done(ctx, addVariantValue(ctx.elements, prop, value, copyFrom), `Added ${value} to ${prop}${copyFrom === null ? '' : `, as a copy of ${copyFrom}`}`);
        }
        case 'remove_value':
            if (value === null || !axis.values.includes(value))
                return needValue();
            if (value === axis.defaultValue)
                return fail(`${value} is the default. Make another value the default first, or remove the property.`);
            if (axis.values.length <= 2)
                return fail(`${prop} would have one value left. Remove the property instead.`);
            return done(ctx, removeVariantValue(ctx.elements, prop, value), `Removed ${value} from ${prop}, with its styles`);
        case 'make_default':
            if (value === null || !axis.values.includes(value))
                return needValue();
            if (value === axis.defaultValue)
                return fail(`${value} is already the default.`);
            return done(ctx, makeVariantDefault(ctx.elements, prop, value), `Made ${value} the default ${prop}; every look is unchanged`);
        case 'add_interaction': {
            const i = readInteraction(ctx, axis, args);
            if (typeof i === 'string')
                return fail(i);
            const problem = interactionError(axes, i);
            if (problem !== null)
                return fail(problem);
            return done(ctx, addVariantInteraction(ctx.elements, i), `Added the interaction ${describe(i, ctx)}`, [
                ...(i.trigger === 'click' || i.trigger === 'outside' || i.trigger === 'escape'
                    ? ['A click, a click outside, and Escape run only in a Scamp framework project. Put a click on a <button>.']
                    : []),
            ]);
        }
        case 'remove_interaction': {
            const i = readInteraction(ctx, axis, args);
            if (typeof i === 'string')
                return fail(i);
            const next = removeVariantInteraction(ctx.elements, i);
            if (next === ctx.elements) {
                const list = interactionsOf(ctx.elements).map((x) => describe(x, ctx));
                return fail(`No such interaction. The component has: ${list.length === 0 ? 'none' : list.join('; ')}.`);
            }
            return done(ctx, next, `Removed the interaction ${describe(i, ctx)}`);
        }
        default:
            return fail(`"action" must be one of ${VARIANT_ACTIONS.join(', ')}.`);
    }
};
