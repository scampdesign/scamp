import type { ProjectFormat, ThemeDef, ThemeToken } from '@shared/types';
import { viewSlugFor } from '@shared/templates';

import {
  buildContextModel,
  type ContextElement,
  type ContextTarget,
} from './contextModel';
import type { SampleValue, ScampElement } from './element';
import type { PatchEntry } from './patchLog';
import { isGridTable, tableCaptionRule, tableSubgridRule } from './tableGrid';
import { tableStyleRules } from './tableStyle';
import { lintView, type ViewFinding } from './viewLint';
import { checkProject, checkTarget, type ProjectCheck } from './projectCheck';
import {
  findGuidanceSection,
  guidanceFor,
  guidanceSectionTitles,
  guidanceSummary,
  type GuidanceSection,
} from '@shared/templates';
import { classNameFor, tagFor } from './generateCode';
import {
  collectViewProps,
  propsTypeSource,
  viewEventNames,
  type ViewPropKind,
} from './viewProps';

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
 * see docs/archive/2026-08-06-mcp-server-plan.md
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
  /** Problems in document order; empty when the view arrived intact. */
  findings: ViewFinding[];
  /** Valid CSS the panel can't show in a control — leave it. */
  notes: ViewFinding[];
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
  /** Components only: each variant axis, its values, and the default. CONTRACT.md §1.3.1 */
  variants?: Array<{ prop: string; values: string[]; default: string }>;
};

export type ThemeTokensResult = {
  tokens: Array<{ name: string; value: string }>;
  themes: Array<{ id: string; label: string }>;
  activeThemeId: string;
};

export type CanvasStateResult = {
  active: ActiveTargetResult;
  selectedElementId: string | null;
  breakpoint: { id: string; label: string; width: number };
  elements: Record<string, NonNullable<ElementResult>>;
  /** Present only when the element cap kicked in. */
  truncated?: { returned: number; total: number; hint: string };
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
export const CANVAS_STATE_ELEMENT_LIMIT = 200;

/**
 * Project-relative POSIX paths for a page.
 *
 * Mirrors `main/ipc/pageOps.ts` → `pagePathsFor`, which is the source of
 * truth for where pages live. Duplicated rather than imported because that
 * one builds ABSOLUTE paths with `path.join` — backslashes on Windows, and a
 * leaked home directory in text an agent will quote back.
 */
export const pagePathsRelative = (
  pageName: string,
  format: ProjectFormat
): { tsx: string; css: string } => {
  if (format === 'legacy') {
    return { tsx: `${pageName}.tsx`, css: `${pageName}.module.css` };
  }
  if (pageName === 'home') {
    return { tsx: 'app/page.tsx', css: 'app/page.module.css' };
  }
  return {
    tsx: `app/${pageName}/page.tsx`,
    css: `app/${pageName}/page.module.css`,
  };
};

/** Mirrors `main/ipc/componentOps.ts` → `componentPathsFor`. */
export const componentPathsRelative = (
  name: string
): { tsx: string; css: string } => ({
  tsx: `components/${name}/${name}.tsx`,
  css: `components/${name}/${name}.module.css`,
});

/** Mirrors `main/ipc/componentOps.ts` → `componentPathsFor` for views. */
export const viewPathsRelative = (
  name: string
): { tsx: string; css: string } => ({
  tsx: `views/${name}/${name}.tsx`,
  css: `views/${name}/${name}.module.css`,
});

/** A table's derived rules, or nothing. see `ElementResult.tableRules` */
const tableRulesOf = (el: ScampElement): { tableRules?: string[] } => {
  if (el.tag !== 'table') return {};
  const cls = classNameFor(el);
  const rules = [
    ...(isGridTable(el) ? [tableSubgridRule(cls), tableCaptionRule(cls)] : []),
    ...tableStyleRules(cls, el.tableStyle),
  ];
  return rules.length > 0 ? { tableRules: rules } : {};
};

/** `ContextElement` → the tool's element shape. */
const toElementResult = (
  el: ContextElement,
  source: ScampElement
): NonNullable<ElementResult> => ({
  id: el.id,
  class: el.className,
  tag: el.tag,
  ...(el.name !== undefined ? { name: el.name } : {}),
  parentId: source.parentId,
  childIds: [...source.childIds],
  styles: el.styles,
  customProperties: Object.fromEntries(el.customProperties),
  ...tableRulesOf(source),
});

/**
 * Describe one element by id, via the shared model.
 *
 * Routing through `buildContextModel` rather than reading the element
 * directly is deliberate: it's what guarantees the MCP answer and the context
 * file report the same declarations, including the custom-property split.
 */
const describeById = (
  input: SnapshotInput,
  id: string
): NonNullable<ElementResult> | null => {
  const source = input.elements[id];
  if (source === undefined) return null;
  const model = buildContextModel({
    target: input.target,
    elements: input.elements,
    selectedIds: [id],
    canvasWidth: input.canvasWidth,
    breakpointLabel: input.breakpointLabel,
  });
  return model.element === null ? null : toElementResult(model.element, source);
};

export const getActiveTarget = (input: SnapshotInput): ActiveTargetResult => {
  const { target } = input;
  if (target === null) return null;
  return {
    kind: target.kind,
    name: target.name,
    tsx: target.tsxPath,
    css: target.cssPath,
  };
};

export const getSelectedElement = (input: SnapshotInput): ElementResult => {
  const primary = input.selectedIds[0];
  return primary === undefined ? null : describeById(input, primary);
};

export const getElementById = (
  input: SnapshotInput,
  id: string
): ElementResult => describeById(input, id);

/**
 * The tree, ids and tags only.
 *
 * Deliberately style-free — this is the cheap structural tool an agent uses
 * to orient before pulling detail with `get_element_by_id`. Adding styles
 * here would make it another `get_canvas_state`.
 */
export const getElementTree = (
  input: SnapshotInput
): { root: TreeNode } | null => {
  const root = input.elements[input.rootElementId];
  if (root === undefined) return null;

  // Iterative with a seen-set: a corrupt parent/child cycle would otherwise
  // recurse until the stack blows, and this runs on live in-memory state
  // that an external edit may have just reshaped.
  const seen = new Set<string>();
  const build = (el: ScampElement): TreeNode => {
    seen.add(el.id);
    const children: TreeNode[] = [];
    for (const childId of el.childIds) {
      if (seen.has(childId)) continue;
      const child = input.elements[childId];
      if (child !== undefined) children.push(build(child));
    }
    return { id: el.id, class: classNameFor(el), tag: tagFor(el), children };
  };
  return { root: build(root) };
};

export const listPages = (input: SnapshotInput): FileListItem[] => [
  ...input.pageNames.map(
    (name): FileListItem => ({
      name,
      kind: 'page',
      ...pagePathsRelative(name, input.projectFormat),
    })
  ),
  ...(input.viewNames ?? []).map(
    (view): FileListItem => ({
      name: viewSlugFor(view),
      kind: 'view',
      view,
      ...viewPathsRelative(view),
    })
  ),
];

/**
 * The props a view or component accepts, from its live tree.
 *
 * `name` is the PascalCase file name, or — because `scamp_list_pages`
 * reports a view by its route slug — that slug. The type text comes
 * from the same formatter the generator uses, so what the agent reads
 * here is byte-for-byte what the file declares.
 */
/**
 * A view or component by name or route slug. The one open on the canvas
 * is read from the canvas itself: its stored tree is how it was when the
 * project loaded, so an agent checking its own edits saw none of them.
 */
/** The stored tree's name for a view or component name, or a view's route slug. */
export const treeNameFor = (
  trees: Readonly<Record<string, { kind?: 'component' | 'view' }>>,
  name: string
): string | null => {
  if (trees[name] !== undefined) return name;
  return Object.keys(trees).find((candidate) => trees[candidate]?.kind === 'view' && viewSlugFor(candidate) === name) ?? null;
};

const treeNamed = (input: SnapshotInput, name: string): { name: string; tree: SnapshotTree } | null => {
  const trees = input.trees ?? {};
  const match = treeNameFor(trees, name) ?? undefined;
  const tree = match === undefined ? undefined : trees[match];
  if (match === undefined || tree === undefined) return null;
  const open = input.target;
  if (open !== null && open.kind !== 'page' && open.name === match) {
    return { name: match, tree: { kind: tree.kind, elements: input.elements, rootId: input.rootElementId } };
  }
  return { name: match, tree };
};

export const getViewProps = (
  input: SnapshotInput,
  name: string
): ViewPropsResult => {
  const found = treeNamed(input, name);
  if (found === null) return null;
  const { name: match, tree } = found;
  const props = collectViewProps(tree.elements, tree.rootId);
  const samples: Record<string, SampleValue> = {};
  for (const prop of props) {
    if (prop.defaultValue !== undefined) samples[prop.name] = prop.defaultValue;
  }
  return {
    name: match,
    kind: tree.kind,
    ...(tree.kind === 'view' ? viewPathsRelative(match) : componentPathsRelative(match)),
    propsType: propsTypeSource(`${match}Props`, props),
    props: props.map((p) => ({
      name: p.name,
      kind: p.kind,
      type: p.tsType,
      ...(p.defaultValue !== undefined ? { default: p.defaultValue } : {}),
    })),
    events: viewEventNames(props),
    // Problems only: a note is valid CSS, not something the view lost.
    warnings: lintView({
      elements: tree.elements,
      rootId: tree.rootId,
      themeTokens: input.themeTokens.map((token) => token.name),
      componentRoots: componentRootsFrom(input),
    }).filter((f) => f.severity === 'problem'),
    samples,
  };
};

/** Components by name and path, with their variant axes when they have any. */
export const listComponents = (input: SnapshotInput): FileListItem[] =>
  input.componentNames.map((name) => {
    const tree = input.trees?.[name];
    const axes = tree?.elements[tree.rootId]?.variantAxes ?? [];
    return {
      name,
      ...componentPathsRelative(name),
      ...(axes.length > 0
        ? { variants: axes.map((a) => ({ prop: a.prop, values: [...a.values], default: a.defaultValue })) }
        : {}),
    };
  });

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
export const getViewCheck = (input: SnapshotInput, name: string): ViewCheckResult => {
  const found = treeNamed(input, name);
  if (found === null) return null;
  const { name: match, tree } = found;
  const { findings, notes } = checkTarget(
    { name: match, kind: tree.kind, elements: tree.elements, rootId: tree.rootId },
    input.themeTokens.map((token) => token.name),
    componentRootsFrom(input)
  );
  return { name: match, kind: tree.kind, findings, notes };
};

/** Each component's root, so an instance is checked as what it renders. */
const componentRootsFrom = (input: SnapshotInput): Record<string, ScampElement | undefined> =>
  Object.fromEntries(Object.entries(input.trees ?? {}).map(([name, tree]) => [name, tree.elements[tree.rootId]]));

/**
 * Every view and component in the snapshot. The app answers this from
 * disk, plain pages included (syncBridge/agentChecks.ts); this is the
 * headless runner's answer, which has only the trees it was given.
 */
export const getProjectCheck = (input: SnapshotInput): ProjectCheck =>
  checkProject(
    Object.keys(input.trees ?? {}).flatMap((name) => {
      const found = treeNamed(input, name);
      return found === null
        ? []
        : [{ name: found.name, kind: found.tree.kind, elements: found.tree.elements, rootId: found.tree.rootId }];
    }),
    input.themeTokens.map((token) => token.name)
  );

/**
 * The project's own guidance, sliced. Answers from the same templates
 * that write `agent.md`, so an agent that asks and one that reads the
 * file get the same rules. see docs/notes/agent-md-layouts.md
 */
export const getConventions = (
  input: SnapshotInput,
  section: string
): ConventionsResult => {
  const md = guidanceFor(input.projectFormat);
  return {
    format: input.projectFormat,
    sections: guidanceSectionTitles(md),
    summary: guidanceSummary(md),
    ...(section.length > 0 ? { section: findGuidanceSection(md, section) } : {}),
  };
};

export const getThemeTokens = (input: SnapshotInput): ThemeTokensResult => ({
  tokens: input.themeTokens.map(({ name, value }) => ({ name, value })),
  themes: input.themes.map(({ id, label }) => ({ id, label })),
  activeThemeId: input.activeThemeId,
});

/**
 * The input as if `view` were open on the canvas, so the element reads
 * answer about any view or component, not only the open one. No `view`,
 * or the open one, reads the canvas. Throws for a name that isn't there.
 */
export const inputForView = (input: SnapshotInput, view: unknown): SnapshotInput => {
  if (typeof view !== 'string' || view.trim().length === 0) return input;
  const found = treeNamed(input, view.trim());
  if (found === null) {
    throw new Error(`No view or component named "${view}". scamp_list_pages (the \`view\` field) and scamp_list_components list them.`);
  }
  if (input.target !== null && input.target.name === found.name) return input;
  const paths = found.tree.kind === 'view' ? viewPathsRelative(found.name) : componentPathsRelative(found.name);
  return {
    ...input,
    target: { kind: found.tree.kind, name: found.name, tsxPath: paths.tsx, cssPath: paths.css },
    elements: found.tree.elements,
    rootElementId: found.tree.rootId,
    selectedIds: [],
  };
};

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
export const answerSnapshotTool = (
  tool: string,
  args: Record<string, unknown>,
  input: SnapshotInput
): unknown => {
  switch (tool) {
    case 'scamp_get_active_page':
      return getActiveTarget(input);
    case 'scamp_get_selected_element':
      return getSelectedElement(input);
    case 'scamp_get_element_by_id':
      return getElementById(inputForView(input, args['view']), String(args['id'] ?? ''));
    case 'scamp_get_element_tree':
      return getElementTree(inputForView(input, args['view']));
    case 'scamp_get_canvas_state':
      return getCanvasState(input);
    case 'scamp_list_pages':
      return listPages(input);
    case 'scamp_list_components':
      return listComponents(input);
    case 'scamp_get_theme_tokens':
      return getThemeTokens(input);
    case 'scamp_get_view_props':
      return getViewProps(input, String(args['name'] ?? ''));
    case 'scamp_check_view':
      return getViewCheck(input, String(args['name'] ?? ''));
    case 'scamp_check_project':
      return getProjectCheck(input);
    case 'scamp_get_conventions':
      return getConventions(input, String(args['section'] ?? ''));
    case 'scamp_get_recent_edits':
      return getRecentEdits(input, Number(args['since'] ?? 0));
    default:
      throw new Error(`Unknown snapshot tool: ${tool}`);
  }
};

/** Long enough to read, short enough not to flood an agent's context. */
const MAX_HUNK_CHARS = 1000;

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
      changes: Array<{ line: number; removed: number; added: number; text: string }>;
    }>;
  }>;
};

/**
 * What the designer changed, in lines rather than offsets: an agent has
 * the file, not the version the offsets were taken against.
 */
export const getRecentEdits = (
  input: SnapshotInput,
  since: number
): RecentEditsResult => {
  const all = input.recentEdits ?? [];
  const from = Number.isFinite(since) && since > 0 ? since : 0;
  const saves = all.filter((entry) => entry.revision > from);
  return {
    revision: all.length > 0 ? (all[all.length - 1]?.revision ?? 0) : 0,
    saves: saves.map((entry) => ({
      revision: entry.revision,
      at: new Date(entry.at).toISOString(),
      target: entry.target,
      kind: entry.kind,
      files: entry.files.map((file) => ({
        path: file.path,
        changes: file.hunks.map((hunk) => ({
          line: hunk.line,
          removed: hunk.removed,
          added: hunk.added,
          text:
            hunk.text.length > MAX_HUNK_CHARS
              ? `${hunk.text.slice(0, MAX_HUNK_CHARS)}\n… (${hunk.text.length - MAX_HUNK_CHARS} more characters)`
              : hunk.text,
        })),
      })),
    })),
  };
};

export const getCanvasState = (input: SnapshotInput): CanvasStateResult => {
  const ids = Object.keys(input.elements);
  const kept = ids.slice(0, CANVAS_STATE_ELEMENT_LIMIT);
  const elements: Record<string, NonNullable<ElementResult>> = {};
  for (const id of kept) {
    const described = describeById(input, id);
    if (described !== null) elements[id] = described;
  }
  return {
    active: getActiveTarget(input),
    selectedElementId: input.selectedIds[0] ?? null,
    breakpoint: {
      id: input.breakpointId,
      label: input.breakpointLabel,
      width: input.canvasWidth,
    },
    elements,
    ...(ids.length > kept.length
      ? {
          truncated: {
            returned: kept.length,
            total: ids.length,
            hint: `Only the first ${kept.length} of ${ids.length} elements are included. Use scamp_get_element_tree for the full structure and scamp_get_element_by_id for the rest.`,
          },
        }
      : {}),
  };
};
