import { type SampleRow, type SampleValue, type ScampElement } from './element';
/**
 * The props type of a view or component, inferred from its elements'
 * bindings and sample data. Pure. The generator writes the type and
 * the destructure from this list; the MCP `scamp_get_view_props` tool
 * and the Data tab read it. see docs/notes/view-bindings.md
 */
export type ViewPropKind = 'text' | 'attribute' | 'boolean' | 'repeat' | 'show' | 'event' | 'slot';
export type ViewProp = {
    name: string;
    kind: ViewPropKind;
    /** The TypeScript type written into `<Name>Props`. */
    tsType: string;
    /** The default in the destructure; absent for events and slots. */
    defaultValue?: SampleValue;
};
/** HTML attributes whose presence is the value; bound, they type as boolean. */
export declare const BOOLEAN_ATTRIBUTES: ReadonlySet<string>;
/**
 * Names a prop can't take: React keeps `key`, `ref`, `children`, `style`,
 * and `className` for itself, and a JavaScript keyword can't be a
 * destructured binding (`{ class = "a" }` is a syntax error).
 */
export declare const RESERVED_PROP_NAMES: ReadonlySet<string>;
/** `player.label` binds a row field, not a prop. */
export declare const isRowPath: (ref: string) => boolean;
/** The prop behind a binding expression: `!canStart` → `canStart`. */
export declare const bindPropName: (expr: string) => string;
export declare const isInvertedBinding: (expr: string) => boolean;
/**
 * The row type of a repeat, from its sample rows: the first row's field
 * order, each field `number` only when every row holds a number.
 */
export declare const rowTypeFor: (rows: ReadonlyArray<SampleRow>) => string;
/**
 * Walk the tree from `rootId` and collect the props in the order the
 * contract fixes: every non-event prop in document order (per element:
 * show, repeat, the text prop, then bound attributes in binding order),
 * then event props in document order, then slots. `className` is not
 * included; the generator appends it last. A name is declared once —
 * the first binding wins its default.
 */
export declare const collectViewProps: (elements: Record<string, ScampElement>, rootId: string) => ViewProp[];
/**
 * The `<Name>Props` type exactly as the file declares it: every prop
 * optional, `className` last. One source for the generator and the
 * MCP `scamp_get_view_props` answer, so an agent reads the same text
 * it would find in the file.
 */
export declare const propsTypeSource: (typeName: string, props: ReadonlyArray<ViewProp>) => string;
/** The event-prop names, in props-type order — what `_scamp.events` lists. */
export declare const viewEventNames: (props: ReadonlyArray<ViewProp>) => string[];
/**
 * The nearest repeat above (or on) an element, walking parents. Used to
 * resolve a row path against the right list.
 */
export declare const enclosingRepeat: (elements: Record<string, ScampElement>, id: string) => {
    over: string;
    as: string;
} | null;
