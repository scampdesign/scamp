import type { ProjectFormat, ThemeDef, ThemeToken } from '@shared/types';
import { type ContextTarget } from './contextModel';
import type { SampleValue, ScampElement } from './element';
import type { PatchEntry } from './patchLog';
import { type ViewFinding } from './viewLint';
import { type GuidanceSection } from '@shared/templates';
import { type ViewPropKind } from './viewProps';
/**
 * The canvas, in the shapes the MCP tools return.
 *
 * The third renderer over `contextModel` — after the context file and the
 * copy-context one-liner — and the reason that model exists. An agent asking
 * "what is selected" and the context file describing the same element must
 * not be able to disagree, so both answer from one derivation.
 *
 * Pure: no store reads, no IPC, no clock. Everything arrives in
 * `SnapshotInput` so the whole surface is testable without an app.
 * see docs/plans/mcp-server-plan.md
 */
/** Everything the eight tools need, supplied by the caller. */
export type SnapshotInput = {
    projectFormat: ProjectFormat;
    /** Null when no project is open. */
    target: ContextTarget | null;
    elements: Record<string, ScampElement>;
    rootElementId: string;
    /** Selection in panel order — index 0 is the primary. */
    selectedIds: ReadonlyArray<string>;
    pageNames: ReadonlyArray<string>;
    componentNames: ReadonlyArray<string>;
    /** Views (`views/<Name>/`); absent means none. */
    viewNames?: ReadonlyArray<string>;
    /** Every component and view tree by name, for `scamp_get_view_props`. */
    trees?: Readonly<Record<string, SnapshotTree>>;
    themeTokens: ReadonlyArray<ThemeToken>;
    themes: ReadonlyArray<ThemeDef>;
    activeThemeId: string;
    breakpointId: string;
    breakpointLabel: string;
    canvasWidth: number;
    /** The session's saves, for `scamp_get_recent_edits`. Oldest first. */
    recentEdits?: ReadonlyArray<PatchEntry>;
};
export type SnapshotTree = {
    kind: 'component' | 'view';
    elements: Record<string, ScampElement>;
    rootId: string;
};
export type ViewPropsResult = {
    name: string;
    kind: 'component' | 'view';
    tsx: string;
    css: string;
    /** The `<Name>Props` type exactly as the file declares it. */
    propsType: string;
    props: Array<{
        name: string;
        kind: ViewPropKind;
        type: string;
        /** The default in the destructure; absent for events and slots. */
        default?: SampleValue;
    }>;
    /** Event-prop names in order — what `_scamp.events` lists. */
    events: string[];
    /** The sample data the design renders with, per prop. */
    samples: Record<string, SampleValue>;
    /**
     * What this view lost on the way in, if anything. Present because the
     * props type can read as complete and correct while a binding behind
     * it is already gone — which is exactly what happened when an
     * `<img>`'s bound src was dropped on parse. Empty when the view
     * arrived intact. see docs/notes/view-lint.md
     */
    warnings: ViewFinding[];
} | null;
export type ConventionsResult = {
    format: ProjectFormat;
    /** Every `##` section, so the agent can name one. */
    sections: string[];
    /** The TL;DR, always — this is the "short version by default". */
    summary: string;
    /** The section asked for; absent when none was, null when unknown. */
    section?: GuidanceSection | null;
};
export type ViewCheckResult = {
    name: string;
    kind: 'component' | 'view';
    /** Findings in document order; empty when the view arrived intact. */
    findings: ViewFinding[];
} | null;
export type ActiveTargetResult = {
    kind: 'page' | 'component' | 'view';
    name: string;
    tsx: string;
    css: string;
} | null;
export type ElementResult = {
    id: string;
    class: string;
    tag: string;
    /** The user's own label, when they've set one. */
    name?: string;
    /** Null for the page/component root. */
    parentId: string | null;
    childIds: string[];
    styles: Record<string, string>;
    customProperties: Record<string, string>;
    /**
     * A table's derived rules, exactly as the file has them: the subgrid
     * that carries its columns to the rows, and its row and cell styling.
     * Scamp writes and owns these. Absent on anything but a table that
     * has some.
     */
    tableRules?: string[];
} | null;
export type TreeNode = {
    id: string;
    class: string;
    tag: string;
    children: TreeNode[];
};
export type FileListItem = {
    name: string;
    tsx: string;
    css: string;
    /** Pages only: `view` when the page's design lives under views/<Name>/. */
    kind?: 'page' | 'view';
    /** Pages of kind `view`: the PascalCase view name; `name` is the route slug. */
    view?: string;
};
export type ThemeTokensResult = {
    tokens: Array<{
        name: string;
        value: string;
    }>;
    themes: Array<{
        id: string;
        label: string;
    }>;
    activeThemeId: string;
};
export type CanvasStateResult = {
    active: ActiveTargetResult;
    selectedElementId: string | null;
    breakpoint: {
        id: string;
        label: string;
        width: number;
    };
    elements: Record<string, NonNullable<ElementResult>>;
    /** Present only when the element cap kicked in. */
    truncated?: {
        returned: number;
        total: number;
        hint: string;
    };
};
/**
 * Ceiling on elements returned by `get_canvas_state`.
 *
 * The whole map on a busy page runs to tens of kilobytes, and it lands
 * directly in the agent's context window. Agents reach for the broadest tool
 * first, so an uncapped version would be the expensive default rather than
 * the considered choice. A truncated answer that SAYS it was truncated beats
 * both an unbounded one and no tool at all.
 */
export declare const CANVAS_STATE_ELEMENT_LIMIT = 200;
/**
 * Project-relative POSIX paths for a page.
 *
 * Mirrors `main/ipc/pageOps.ts` → `pagePathsFor`, which is the source of
 * truth for where pages live. Duplicated rather than imported because that
 * one builds ABSOLUTE paths with `path.join` — backslashes on Windows, and a
 * leaked home directory in text an agent will quote back.
 */
export declare const pagePathsRelative: (pageName: string, format: ProjectFormat) => {
    tsx: string;
    css: string;
};
/** Mirrors `main/ipc/componentOps.ts` → `componentPathsFor`. */
export declare const componentPathsRelative: (name: string) => {
    tsx: string;
    css: string;
};
/** Mirrors `main/ipc/componentOps.ts` → `componentPathsFor` for views. */
export declare const viewPathsRelative: (name: string) => {
    tsx: string;
    css: string;
};
export declare const getActiveTarget: (input: SnapshotInput) => ActiveTargetResult;
export declare const getSelectedElement: (input: SnapshotInput) => ElementResult;
export declare const getElementById: (input: SnapshotInput, id: string) => ElementResult;
/**
 * The tree, ids and tags only.
 *
 * Deliberately style-free — this is the cheap structural tool an agent uses
 * to orient before pulling detail with `get_element_by_id`. Adding styles
 * here would make it another `get_canvas_state`.
 */
export declare const getElementTree: (input: SnapshotInput) => {
    root: TreeNode;
} | null;
export declare const listPages: (input: SnapshotInput) => FileListItem[];
/**
 * The props a view or component accepts, from its live tree.
 *
 * `name` is the PascalCase file name, or — because `scamp_list_pages`
 * reports a view by its route slug — that slug. The type text comes
 * from the same formatter the generator uses, so what the agent reads
 * here is byte-for-byte what the file declares.
 */
export declare const getViewProps: (input: SnapshotInput, name: string) => ViewPropsResult;
/**
 * Components by name and path.
 *
 * No `variants` field: variants aren't on `main` yet, and a field an agent is
 * told to expect but always finds empty reads as "this component has none".
 * Adding it later is additive.
 */
export declare const listComponents: (input: SnapshotInput) => FileListItem[];
/**
 * Theme tokens exactly as they sit in `theme.css` — a flat list, not grouped
 * into colours / typography / spacing.
 *
 * The agent reading this is usually about to EDIT that file. Inventing a
 * structure the file doesn't have would leave it editing against the wrong
 * shape, and the grouping would have to be guessed from name prefixes, which
 * breaks silently the first time a token is named unconventionally.
 */
/**
 * What a view lost on the way into the canvas. Answers the same names
 * `scamp_get_view_props` takes, so an agent that just wrote a view can
 * check it without first working out what Scamp calls the thing.
 * see docs/notes/view-lint.md
 */
export declare const getViewCheck: (input: SnapshotInput, name: string) => ViewCheckResult;
/**
 * The project's own guidance, sliced. Answers from the same templates
 * that write `agent.md`, so an agent that asks and one that reads the
 * file get the same rules. see docs/notes/agent-md-layouts.md
 */
export declare const getConventions: (input: SnapshotInput, section: string) => ConventionsResult;
export declare const getThemeTokens: (input: SnapshotInput) => ThemeTokensResult;
/**
 * Map an MCP tool name onto its snapshot function.
 *
 * Lives here rather than in the renderer's IPC responder so the whole tool
 * surface is testable without a window — the responder becomes "read store,
 * call this, reply".
 *
 * Throws on an unknown name: the protocol layer has already checked it, so
 * reaching here means the two lists have drifted, and a thrown error surfaces
 * that as an `isError` result rather than a confusing `null`.
 */
export declare const answerSnapshotTool: (tool: string, args: Record<string, unknown>, input: SnapshotInput) => unknown;
export type RecentEditsResult = {
    /** Pass back as `since` to get only what follows. */
    revision: number;
    saves: Array<{
        revision: number;
        at: string;
        target: string;
        kind: 'page' | 'component';
        files: Array<{
            path: string;
            changes: Array<{
                line: number;
                removed: number;
                added: number;
                text: string;
            }>;
        }>;
    }>;
};
/**
 * What the designer changed, in lines rather than offsets: an agent has
 * the file, not the version the offsets were taken against.
 */
export declare const getRecentEdits: (input: SnapshotInput, since: number) => RecentEditsResult;
export declare const getCanvasState: (input: SnapshotInput) => CanvasStateResult;
