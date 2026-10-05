import type { RawDeclaration } from './parseCode/css';
import type { TableStyle } from './element';
/** The derived rules for one table, in a fixed order. */
export declare const tableStyleRules: (className: string, style: TableStyle | undefined) => string[];
/**
 * Is this the selector of a rule a table derives? Selector only: the
 * incremental writer uses it to know the rule is Scamp's to remove.
 */
export declare const isTableRuleSelector: (selector: string) => boolean;
export type TableRuleMatch = 
/** The derived subgrid rule — owned by `@lib/tableGrid`, not stored. */
{
    kind: 'subgrid';
    className: string;
}
/** A derived styling rule, read back into typed settings. */
 | {
    kind: 'style';
    className: string;
    style: TableStyle;
}
/**
 * A styling selector whose body was edited into something the typed
 * settings cannot reproduce. Kept verbatim on the table instead.
 */
 | {
    kind: 'raw';
    className: string;
};
/**
 * Recognise a rule `tableStyleRules` or `tableSubgridRule` writes.
 *
 * Strict by design: a body counts as typed only when re-emitting what
 * was read gives back the same declarations. An agent that adds a
 * `color` to the stripe rule, or writes `solid 1px` instead of
 * `1px solid`, gets its rule kept verbatim rather than rewritten.
 *
 * Returns null for anything that is not one of these selectors.
 */
export declare const matchTableRule: (selector: string, decls: ReadonlyArray<RawDeclaration>) => TableRuleMatch | null;
/**
 * Apply a panel edit to a table's styling. A key set to `undefined`
 * is removed, and a style left with no keys becomes `undefined`, so
 * clearing every setting leaves no trace on the element.
 */
export declare const mergeTableStyle: (current: TableStyle | undefined, patch: TableStyle) => TableStyle | undefined;
