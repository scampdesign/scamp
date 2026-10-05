import { type ScampElement } from './element';
/**
 * What a view lost on the way into the canvas. A file can parse
 * perfectly and still arrive degraded — a binding Scamp kept as opaque
 * text, a declaration that fell out of the panel, a token that resolves
 * to nothing — and the element tree looks correct in every one of those
 * cases. `scamp_get_element_tree` reports structure, so an agent that
 * follows the documented "confirm it parsed" step learns nothing.
 * see docs/notes/view-lint.md
 */
export type ViewFindingKind = 'marker-leaked' | 'binding-not-parsed' | 'not-panel-editable' | 'side-not-typed' | 'undeclared-token' | 'raw-text-fragment' | 'repeat-rows-differ' | 'missing-sample' | 'table-structure' | 'table-cell-width' | 'table-repeated-style' | 'table-rowspan';
export type ViewFinding = {
    kind: ViewFindingKind;
    /** The element it sits on; null for a whole-view finding. */
    elementId: string | null;
    /** The element's CSS class, which is how an agent addresses it in the file. */
    className: string | null;
    /** What is wrong, in one sentence. */
    message: string;
    /** What to write instead. Absent when there's nothing actionable to say. */
    hint?: string;
};
export type LintInput = {
    elements: Record<string, ScampElement>;
    rootId: string;
    /** Every custom property `theme.css` declares, `--name` included. */
    themeTokens: ReadonlyArray<string>;
};
/**
 * Read a parsed view and report what degraded. Pure: it reads the tree
 * the parser produced, never the file, so it says exactly what the
 * canvas will show rather than what the source looks like.
 */
export declare const lintView: (input: LintInput) => ViewFinding[];
