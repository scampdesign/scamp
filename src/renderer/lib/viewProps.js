import { PASSTHROUGH_PROP } from './classNamePassthrough';
import { attributeSample } from './element';
/** HTML attributes whose presence is the value; bound, they type as boolean. */
export const BOOLEAN_ATTRIBUTES = new Set([
    'disabled',
    'checked',
    'selected',
    'required',
    'readonly',
    'readOnly',
    'hidden',
    'open',
    'controls',
    'autoplay',
    'autoPlay',
    'loop',
    'muted',
    'multiple',
    'autofocus',
    'autoFocus',
]);
/**
 * Names a prop can't take: React keeps `key`, `ref`, `children`, `style`,
 * and `className` for itself, and a JavaScript keyword can't be a
 * destructured binding (`{ class = "a" }` is a syntax error).
 */
export const RESERVED_PROP_NAMES = new Set([
    'className', 'children', 'key', 'ref', 'style',
    'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else',
    'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'implements', 'import', 'in',
    'instanceof', 'interface', 'let', 'new', 'null', 'package', 'private', 'protected', 'public', 'return',
    'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
]);
/** A TypeScript double-quoted string literal. */
const quoteLiteral = (value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
/** `player.label` binds a row field, not a prop. */
export const isRowPath = (ref) => ref.includes('.');
/** The prop behind a binding expression: `!canStart` → `canStart`. */
export const bindPropName = (expr) => expr.startsWith('!') ? expr.slice(1) : expr;
export const isInvertedBinding = (expr) => expr.startsWith('!');
/**
 * The row type of a repeat, from its sample rows: the first row's field
 * order, each field `number` only when every row holds a number.
 */
export const rowTypeFor = (rows) => {
    const first = rows[0];
    if (!first)
        return 'Array<Record<string, string>>';
    const fields = Object.keys(first).map((field) => {
        const allNumbers = rows.every((row) => typeof row[field] === 'number');
        return `${field}: ${allNumbers ? 'number' : 'string'}`;
    });
    return `Array<{ ${fields.join('; ')} }>`;
};
const isRows = (value) => Array.isArray(value);
/**
 * Walk the tree from `rootId` and collect the props in the order the
 * contract fixes: every non-event prop in document order (per element:
 * show, repeat, the text prop, then bound attributes in binding order),
 * then event props in document order, then slots. `className` is not
 * included; the generator appends it last. A name is declared once —
 * the first binding wins its default.
 */
export const collectViewProps = (elements, rootId) => {
    const samples = elements[rootId]?.samples ?? {};
    const seen = new Set();
    const props = [];
    const events = [];
    const slots = [];
    const add = (list, prop) => {
        if (seen.has(prop.name))
            return;
        seen.add(prop.name);
        list.push(prop);
    };
    // Inside a repeat, an event handler receives the row key, and its
    // parameter is named after the key field: `(id: string) => void`.
    const walk = (id, repeatKey) => {
        const el = elements[id];
        if (!el)
            return;
        const insideRepeat = el.repeat !== undefined ? (el.repeat.key ?? 'id') : repeatKey;
        if (el.showIf !== undefined && !isRowPath(el.showIf)) {
            const sample = samples[el.showIf];
            add(props, {
                name: el.showIf,
                kind: 'show',
                tsType: 'boolean',
                defaultValue: typeof sample === 'boolean' ? sample : true,
            });
        }
        if (el.repeat !== undefined) {
            const sample = samples[el.repeat.over];
            const rows = isRows(sample) ? sample : [];
            add(props, {
                name: el.repeat.over,
                kind: 'repeat',
                tsType: rowTypeFor(rows),
                defaultValue: rows,
            });
        }
        if (el.type === 'text' && typeof el.prop === 'string' && el.prop.length > 0 && !isRowPath(el.prop)) {
            add(props, {
                name: el.prop,
                kind: 'text',
                tsType: 'string',
                defaultValue: el.text ?? '',
            });
        }
        for (const [attr, expr] of Object.entries(el.bind ?? {})) {
            const name = bindPropName(expr);
            if (isRowPath(name))
                continue;
            const isInstance = el.type === 'component-instance';
            if (!isInstance && BOOLEAN_ATTRIBUTES.has(attr)) {
                const present = el.attributes?.[attr] !== undefined;
                add(props, {
                    name,
                    kind: 'boolean',
                    tsType: 'boolean',
                    defaultValue: isInvertedBinding(expr) ? !present : present,
                });
                continue;
            }
            const literal = isInstance ? el.propOverrides?.[attr] : attributeSample(el, attr);
            // A variant axis types as the union of its values. CONTRACT.md §1.3.1
            const axis = id === rootId && attr === `data-${name}`
                ? el.variantAxes?.find((a) => a.prop === name)
                : undefined;
            add(props, {
                name,
                kind: 'attribute',
                tsType: axis !== undefined ? axis.values.map(quoteLiteral).join(' | ') : 'string',
                defaultValue: axis !== undefined ? axis.defaultValue : literal ?? '',
            });
        }
        for (const handler of Object.values(el.on ?? {})) {
            if (isRowPath(handler))
                continue;
            add(events, {
                name: handler,
                kind: 'event',
                tsType: insideRepeat !== null ? `(${insideRepeat}: string) => void` : '() => void',
            });
        }
        if (typeof el.slot === 'string' && el.slot.length > 0) {
            add(slots, { name: el.slot, kind: 'slot', tsType: 'React.ReactNode' });
        }
        for (const childId of el.childIds)
            walk(childId, insideRepeat);
    };
    walk(rootId, null);
    return [...props, ...events, ...slots];
};
/**
 * The `<Name>Props` type exactly as the file declares it: every prop
 * optional, `className` last. One source for the generator and the
 * MCP `scamp_get_view_props` answer, so an agent reads the same text
 * it would find in the file.
 */
export const propsTypeSource = (typeName, props) => {
    const lines = [
        ...props.map((p) => `  ${p.name}?: ${p.tsType};`),
        `  ${PASSTHROUGH_PROP}?: string;`,
    ];
    return `type ${typeName} = {\n${lines.join('\n')}\n};`;
};
/** The event-prop names, in props-type order — what `_scamp.events` lists. */
export const viewEventNames = (props) => props.filter((p) => p.kind === 'event').map((p) => p.name);
/**
 * The nearest repeat above (or on) an element, walking parents. Used to
 * resolve a row path against the right list.
 */
export const enclosingRepeat = (elements, id) => {
    let cursor = id;
    while (cursor !== null) {
        const el = elements[cursor];
        if (!el)
            return null;
        if (el.repeat)
            return { over: el.repeat.over, as: el.repeat.as };
        cursor = el.parentId;
    }
    return null;
};
