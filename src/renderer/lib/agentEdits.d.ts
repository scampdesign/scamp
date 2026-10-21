import { type Breakpoint, type ThemeToken } from '@shared/types';
import { type ScampElement } from './element';
export type AgentEditContext = {
    elements: Record<string, ScampElement>;
    rootId: string;
    breakpoints: ReadonlyArray<Breakpoint>;
    /** A component's root is sized differently from a page's. */
    isComponent: boolean;
};
export type AgentEditResult = {
    ok: true;
    elements: Record<string, ScampElement>;
    /** One line for the panel and the model: what changed. */
    summary: string;
    touched: string[];
    /** Anything the model should know about the result. */
    notes: string[];
} | {
    ok: false;
    error: string;
};
/** Find an element by its Scamp id or by its class name. */
export declare const resolveElement: (ctx: AgentEditContext, ref: unknown) => ScampElement | null;
type Declaration = {
    prop: string;
    value: string;
    important: boolean;
};
/** Declarations from a CSS fragment like `display: flex; gap: 12px`. */
export declare const parseDeclarationList: (css: string) => Declaration[] | string;
/**
 * Set and remove declarations on an element's class rule — at a
 * breakpoint, when one is named.
 */
export declare const setStyles: (ctx: AgentEditContext, args: {
    element: unknown;
    set?: unknown;
    remove?: unknown;
    breakpoint?: unknown;
    variant?: unknown;
}) => AgentEditResult;
/**
 * A new element inside `parent`, styled with `css`. Built by parsing a
 * one-element file, so it starts from what Scamp reads for an element
 * with only those declarations — not from the draw tool's defaults.
 */
export declare const addElement: (ctx: AgentEditContext, args: {
    parent: unknown;
    tag?: unknown;
    text?: unknown;
    css?: unknown;
    name?: unknown;
    index?: unknown;
}) => AgentEditResult;
/** Replace a text element's words. */
export declare const setText: (ctx: AgentEditContext, args: {
    element: unknown;
    text: unknown;
}) => AgentEditResult;
/** Change the HTML tag, within what the element's type allows. */
export declare const setTag: (ctx: AgentEditContext, args: {
    element: unknown;
    tag: unknown;
}) => AgentEditResult;
/** Set or remove attributes. A null value removes one. */
export declare const setAttributes: (ctx: AgentEditContext, args: {
    element: unknown;
    attributes: unknown;
}) => AgentEditResult;
/** Move an element to another parent, or to another position in its own. */
export declare const moveElement: (ctx: AgentEditContext, args: {
    element: unknown;
    parent: unknown;
    index?: unknown;
}) => AgentEditResult;
/** Wrap sibling elements in a new container, optionally styled. */
export declare const wrapElements: (ctx: AgentEditContext, args: {
    elements: unknown;
    tag?: unknown;
    css?: unknown;
    name?: unknown;
}) => AgentEditResult;
/** Remove an element and everything inside it. The harness confirms first. */
export declare const deleteElement: (ctx: AgentEditContext, args: {
    element: unknown;
}) => AgentEditResult;
/**
 * Add or change base theme tokens. Pure: the caller reads `theme.css`,
 * merges with this, and writes it back. A value can't carry a `;`, a brace
 * or a newline — it lands inside a declaration, and those would end it.
 */
export declare const mergeThemeTokens: (current: ReadonlyArray<ThemeToken>, updates: unknown) => {
    tokens: ThemeToken[];
    added: string[];
    changed: string[];
} | string;
/**
 * Check a component extraction before any file is written: what to
 * extract, under what name, and which look-alikes become instances of it.
 */
export declare const planExtraction: (ctx: AgentEditContext, args: {
    element: unknown;
    name: unknown;
    alsoReplace?: unknown;
}, existingComponents: ReadonlyArray<string>) => {
    id: string;
    name: string;
    replaceIds: string[];
} | string;
/**
 * Which container becomes an instance of which existing component. Refuses
 * the root, text, and a component the container sits inside — an instance
 * of itself would never finish rendering.
 */
export declare const planInstanceSwap: (ctx: AgentEditContext, args: {
    element: unknown;
    component: unknown;
}, components: ReadonlyArray<string>, editing: string | null) => {
    id: string;
    name: string;
} | string;
/**
 * What the model is told after an edit: the summary, what it touched, any
 * notes, and Scamp's own check findings on those elements — the same
 * findings the Checks section shows, so the agent can fix what it caused.
 * Shared by the app's responder and the headless eval runner, so the model
 * reads identical feedback in both.
 */
export declare const editFeedback: (result: Extract<AgentEditResult, {
    ok: true;
}>, rootId: string, themeTokenNames: ReadonlyArray<string>) => {
    summary: string;
    text: string;
};
/**
 * Show an element only when a boolean prop is true — the `{flag && …}` a
 * React app writes. The sample on the root decides what the canvas shows.
 * see docs/notes/view-bindings.md
 */
export declare const setShow: (ctx: AgentEditContext, args: {
    element: unknown;
    flag: unknown;
    shown?: unknown;
}) => AgentEditResult;
/**
 * Rename a repeated list — the list prop, its row variable, and row
 * fields — everywhere the view uses them and in its sample rows.
 */
export declare const renameList: (ctx: AgentEditContext, args: {
    list: unknown;
    to?: unknown;
    row?: unknown;
    fields?: unknown;
}) => AgentEditResult;
/** The element edits, by tool name: one table for the canvas and the headless agent. */
type Edit = (ctx: AgentEditContext, args: Record<string, unknown>) => AgentEditResult;
export declare const AGENT_EDITS: Readonly<Record<string, Edit>>;
export {};
