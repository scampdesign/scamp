import type { ScampElement } from './element';
/**
 * The facts about the canvas that every agent-facing description is built
 * from — the live context file, the copy-context one-liner, and (next) the
 * MCP server.
 *
 * Deriving them once matters more than it looks: two places independently
 * deciding what "the element's styles" means would drift, and the drift
 * would be silent because nothing compares the two outputs.
 * see docs/archive/2026-08-06-copy-context-button-plan.md
 */
/** The page or component currently open on the canvas. */
export type ContextTarget = {
    kind: 'page' | 'component' | 'view';
    name: string;
    /** Project-RELATIVE. Absolute paths would leak the user's home directory
     *  into text agents quote back verbatim. */
    tsxPath: string;
    cssPath: string;
};
/** A direct child, described structurally so each renderer can phrase it. */
export type ContextChild = {
    className: string;
    tag: string;
    kind: 'text' | 'instance' | 'container' | 'leaf';
    /** Flattened and truncated; present only for `kind: 'text'`. */
    text?: string;
    /** Present only for `kind: 'instance'`. */
    componentName?: string;
    childCount: number;
};
export type ContextElement = {
    id: string;
    className: string;
    tag: string;
    /** The user's own label, when they've set one. */
    name?: string;
    parentClassName?: string;
    /** Ancestors, outermost first. Empty for the root. */
    chain: string[];
    /** `prop: value;` lines, EXCLUDING custom properties. */
    declarations: string[];
    /** The same declarations as a map — `{display: 'flex', gap: '16px'}`.
     *  Derived, never a second source of truth. */
    styles: Record<string, string>;
    customProperties: Array<[string, string]>;
    children: ContextChild[];
};
export type ContextModel = {
    target: ContextTarget | null;
    /** Null when nothing is selected, or the selection no longer exists. */
    element: ContextElement | null;
    /** Selected elements beyond the primary. */
    extraSelected: number;
    /** Elements on the canvas, excluding the page/component root. */
    elementCount: number;
    canvasWidth: number;
    breakpointLabel: string;
};
export type ContextInput = {
    target: ContextTarget | null;
    elements: Record<string, ScampElement>;
    /** Selection in panel order — index 0 is the primary. */
    selectedIds: ReadonlyArray<string>;
    canvasWidth: number;
    breakpointLabel: string;
};
/** Longest text preview shown for a child, before an ellipsis. */
export declare const TEXT_PREVIEW_MAX = 40;
export declare const previewText: (raw: string) => string;
/**
 * `prop: value;` → `[prop, value]`, skipping anything malformed.
 *
 * Lives here rather than in a renderer because two of them need it and a
 * third (MCP) reports the map directly — the same reason the model exists.
 */
export declare const parseDeclarations: (lines: ReadonlyArray<string>) => Map<string, string>;
export declare const buildContextModel: (input: ContextInput) => ContextModel;
