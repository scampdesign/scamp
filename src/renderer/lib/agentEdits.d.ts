import { type Breakpoint } from '@shared/types';
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
export {};
