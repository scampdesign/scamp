import type { EmbeddedEditScope, EmbeddedIdiom, EmbeddedQueueItem } from './types';
/**
 * Embedded Scamp's shared vocabulary: the properties the inspector reads
 * from the page, how they become declarations Scamp's parser understands,
 * and how a queued edit becomes the agent's instructions. Pure.
 * see docs/plans/embedded-scamp-plan.md
 */
/** Computed properties the inspector reads for the panel. */
export declare const EMBEDDED_COMPUTED_PROPERTIES: readonly ["display", "position", "top", "left", "width", "height", "min-width", "min-height", "max-width", "max-height", "padding-top", "padding-right", "padding-bottom", "padding-left", "margin-top", "margin-right", "margin-bottom", "margin-left", "flex-direction", "flex-wrap", "align-items", "justify-content", "align-content", "row-gap", "column-gap", "grid-template-columns", "grid-template-rows", "flex-grow", "flex-shrink", "flex-basis", "align-self", "background-color", "border-top-width", "border-right-width", "border-bottom-width", "border-left-width", "border-top-style", "border-top-color", "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius", "color", "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "text-transform", "font-style", "opacity", "box-shadow", "overflow-x", "overflow-y", "transform", "z-index"];
/**
 * The page's computed styles as declarations, shorthands where Scamp's
 * parser reads them. Values the browser reports at their default are left
 * out, so the panel shows what the element actually has.
 */
export declare const computedToDeclarations: (computed: Record<string, string>) => Array<{
    prop: string;
    value: string;
}>;
/** One queued edit, as the agent reads it. */
export declare const describeQueueItem: (item: EmbeddedQueueItem, index: number) => string;
/** A batch of queued edits as one message to the agent. */
export declare const buildAgentPrompt: (items: ReadonlyArray<EmbeddedQueueItem>, idioms: ReadonlyArray<EmbeddedIdiom>) => string;
/** Messages from the inspector arrive as console lines starting with this. */
export declare const INSPECTOR_PREFIX = "__scamp_inspector__";
export type InspectorConfig = {
    prefix: string;
    attr: string;
    properties: ReadonlyArray<string>;
};
export type InspectorCommand = {
    type: 'edit';
    on: boolean;
} | {
    type: 'freeze';
    on: boolean;
} | {
    type: 'apply';
    scope: EmbeddedEditScope;
    styles: Record<string, string>;
} | {
    type: 'restore';
    scope: EmbeddedEditScope;
    properties: ReadonlyArray<string>;
} | {
    type: 'clear';
} | {
    type: 'deselect';
};
/**
 * Runs IN the page, installed by `webview.executeJavaScript`. Must be
 * self-contained: it's sent as source text, so it can reference nothing
 * outside itself. Idempotent: a second install only updates the config.
 *
 * - **Edit mode** outlines what's under the pointer and selects on click;
 *   the page's own pointer events are swallowed, so a click selects
 *   instead of navigating, and an open menu isn't "clicked outside".
 * - **Freeze** swallows the events transient UI closes on (leave, blur,
 *   Escape), so a popover or tooltip opened by script stays open while
 *   the user moves to the panel. F8 toggles it from inside the page.
 *   CSS `:hover`-only UI can't be held this way: nothing script does
 *   keeps the browser's hover state once the pointer leaves.
 * - **Apply** sets layer-1 styles inline (`!important`), remembering what
 *   was there so `clear` puts it back.
 */
export declare const installInspector: (config: InspectorConfig) => void;
/** The source text that installs the inspector, then runs `cmd` if given. */
export declare const inspectorScript: (config: InspectorConfig, cmd?: InspectorCommand) => string;
