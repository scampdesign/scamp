import type { EmbeddedBreakpoint, EmbeddedContentField, EmbeddedEditScope, EmbeddedHistoryEntry, EmbeddedElementRef, EmbeddedIdiom, EmbeddedMatchedRule, EmbeddedPseudoState, EmbeddedQueueItem, EmbeddedStructureAction } from './types';
/**
 * Embedded Scamp's shared vocabulary: the properties the inspector reads
 * from the page, how they become declarations Scamp's parser understands,
 * and how a queued edit becomes the agent's instructions. Pure.
 * see docs/plans/embedded-scamp-plan.md
 */
/** Computed properties the inspector reads for the panel. */
export declare const EMBEDDED_COMPUTED_PROPERTIES: readonly ["display", "position", "top", "left", "width", "height", "min-width", "min-height", "max-width", "max-height", "padding-top", "padding-right", "padding-bottom", "padding-left", "margin-top", "margin-right", "margin-bottom", "margin-left", "flex-direction", "flex-wrap", "align-items", "justify-content", "align-content", "row-gap", "column-gap", "grid-template-columns", "grid-template-rows", "flex-grow", "flex-shrink", "flex-basis", "align-self", "background-color", "border-top-width", "border-right-width", "border-bottom-width", "border-left-width", "border-top-style", "border-top-color", "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius", "color", "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "text-transform", "font-style", "opacity", "box-shadow", "overflow-x", "overflow-y", "transform", "z-index", "filter", "backdrop-filter", "transition", "animation", "animation-name", "background-image", "background-size", "background-position", "background-repeat", "grid-column", "grid-row", "order", "transform-origin", "text-decoration-line", "text-shadow", "white-space", "cursor", "object-fit", "outline-width", "outline-style", "outline-color", "visibility"];
/**
 * A selector's specificity as [ids, classes, types]. Close enough for
 * picking a winner among the rules that match one element: `:where()`
 * counts nothing, and `:is()`, `:not()`, and `:has()` count their contents.
 */
export declare const specificity: (selector: string) => [number, number, number];
/**
 * Each property's value as written, from the rules that match the element:
 * the winner by importance, layer, specificity, then order; an inline
 * style beats any rule. Left out where it can't be shown as written: a
 * keyword like `inherit`, Tailwind's spacing `calc()`, or a pixel value the
 * page doesn't actually have (a rule Scamp couldn't see won).
 */
export declare const authoredStyles: (rules: ReadonlyArray<EmbeddedMatchedRule>, computed: Record<string, string>) => Record<string, string>;
/**
 * The page's computed styles as declarations, shorthands where Scamp's
 * parser reads them. Values the browser reports at their default are left
 * out, so the panel shows what the element actually has.
 */
export declare const computedToDeclarations: (computed: Record<string, string>) => Array<{
    prop: string;
    value: string;
}>;
/** The scope buttons' words: named after the component when the instances are its own. */
export declare const scopeWords: (el: EmbeddedElementRef) => {
    one: string;
    every: string;
    oneTip: string;
    everyTip: string;
};
/** One queued edit, as the agent reads it. */
export declare const describeQueueItem: (item: EmbeddedQueueItem, index: number) => string;
/** A batch of queued edits as one message to the agent. */
export declare const buildAgentPrompt: (items: ReadonlyArray<EmbeddedQueueItem>, idioms: ReadonlyArray<EmbeddedIdiom>) => string;
/** What to tell the user's own agent to start it working the queue. see docs/plans/embedded-agent-connection-plan.md */
export declare const OWN_AGENT_LINE = "Work my Scamp edit queue: call scamp_embedded_wait_for_edits, write each batch it gives you, call scamp_embedded_done, and keep waiting for more until I say stop.";
/** A route path needs values filled in: `:id` (React Router) or `[id]` (Next.js). */
export declare const routeHasParams: (path: string) => boolean;
/** Known routes plus newly found ones: one each, pages before parameterised paths, then alphabetical. */
export declare const mergeRoutes: (known: ReadonlyArray<string>, found: ReadonlyArray<string>, limit?: number) => string[];
/** One queued edit in a few words: the queue list, the history, and commit messages. */
export declare const shortQueueItem: (item: EmbeddedQueueItem) => string;
/** A change in plain words for people, and the technical form (tags, classes, values) for the tooltip. */
export type ChangeDescription = {
    text: string;
    detail: string;
};
/** One queued edit for people ("Changed spacing on every Card"), with its technical form for the tooltip. */
export declare const describeChange: (item: EmbeddedQueueItem) => ChangeDescription;
/**
 * An Accept's commit: a subject (the user's, or the first change) and the
 * changes in the body, each in plain words with its technical form indented
 * under it, which the history reads back.
 */
export declare const commitMessageFor: (subject: string, changes: ReadonlyArray<ChangeDescription>, files: ReadonlyArray<string>) => {
    subject: string;
    body: string;
};
/** For `git log --name-only`: each record starts with the separator, and the file list ends it. */
export declare const HISTORY_LOG_FORMAT = "%x1e%H%x1f%ct%x1f%s%x1f%b%x1f";
/** `git log --format=HISTORY_LOG_FORMAT --name-only` read into entries, newest first. */
export declare const parseHistoryLog: (text: string) => Array<Omit<EmbeddedHistoryEntry, "undone" | "current">>;
/**
 * The breakpoint an edit made `width` pixels wide applies up to: just under
 * the project's next breakpoint above it, or the width itself when the
 * project has none above. Null at desktop (no width set).
 */
export declare const breakpointFor: (width: number | null, project: ReadonlyArray<number>, direction: "min" | "max" | null) => EmbeddedBreakpoint | null;
/** Messages from the inspector arrive as console lines starting with this. */
export declare const INSPECTOR_PREFIX = "__scamp_inspector__";
export type InspectorConfig = {
    prefix: string;
    attr: string;
    /** The prop on a component's JSX saying where it's used (`data-scamp-call`). */
    callAttr: string;
    properties: ReadonlyArray<string>;
};
export type InspectorState = EmbeddedPseudoState;
export type InspectorCommand = {
    type: 'edit';
    on: boolean;
} | {
    type: 'freeze';
    on: boolean;
}
/**
 * Preview styles on the page. `uid` is the element the edit is about (the
 * selection when omitted), `media` wraps it in a media query (an edit made
 * below desktop width), and `tag` (the queue item's id) lets `undoTag`
 * take back exactly what this edit set.
 */
 | {
    type: 'apply';
    scope: EmbeddedEditScope;
    styles: Record<string, string>;
    state: InspectorState;
    uid?: string;
    media?: string | null;
    tag?: string;
} | {
    type: 'restore';
    scope: EmbeddedEditScope;
    properties: ReadonlyArray<string>;
    state: InspectorState;
    uid?: string;
    media?: string | null;
}
/** Take back everything an edit or move with this tag previewed. */
 | {
    type: 'undoTag';
    tag: string;
}
/** Preview new text, an image source or alt text, or a link target on one element. */
 | {
    type: 'setContent';
    uid: string;
    field: EmbeddedContentField;
    value: string;
    tag: string;
}
/** Open the in-page text editor on an element. */
 | {
    type: 'beginTextEdit';
    uid: string;
} | {
    type: 'clear';
} | {
    type: 'deselect';
}
/** Force a pseudo-class on the selection, as DevTools' `:hov` does. */
 | {
    type: 'state';
    state: InspectorState;
}
/** Let go of every forced state, the frozen ones included. */
 | {
    type: 'release';
}
/** Report the selection again, with its styles as they are now. */
 | {
    type: 'reselect';
} | {
    type: 'selectId';
    id: string;
} | {
    type: 'hoverId';
    id: string | null;
}
/** Move a layer next to a sibling, from the layers tree. */
 | {
    type: 'move';
    id: string;
    targetId: string;
    position: 'before' | 'after' | 'inside';
    tag: string;
}
/** Preview a delete (hidden), a duplicate (a copy after it), or a wrap (outlined). */
 | {
    type: 'structure';
    uid: string;
    action: EmbeddedStructureAction;
    scope: EmbeddedEditScope;
    tag: string;
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
 *   Escape), and marks what's under the pointer for a forced `:hover` (and
 *   what has focus for `:focus`), which main applies through the debugger
 *   protocol, so CSS-only hover UI holds too. F8 toggles it from the page.
 * - **States** force a pseudo-class on the selection; an edit made in one
 *   previews as a `:hover` (or `:focus`, `:active`) rule, not inline.
 * - **Apply** sets layer-1 styles inline (`!important`), remembering what
 *   was there so `clear` puts it back.
 * - **Tree** returns the page as a tree of ids, for the layers panel.
 */
export declare const installInspector: (config: InspectorConfig) => void;
/** The source text that installs the inspector, then runs `cmd` if given. */
export declare const inspectorScript: (config: InspectorConfig, cmd?: InspectorCommand) => string;
/** The source text that returns the widths the page's stylesheets break at. */
export declare const inspectorBreakpointsScript: (config: InspectorConfig) => string;
/** The source text that returns the page's design tokens, installing the inspector first. */
export declare const inspectorTokensScript: (config: InspectorConfig) => string;
/** The source text that returns the page's tree, installing the inspector first. */
export declare const inspectorTreeScript: (config: InspectorConfig) => string;
