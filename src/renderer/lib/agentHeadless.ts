// @lib/agentHeadless.ts — the Scamp Agent's canvas, without a window.
//
// Answers the agent's tools against an in-memory page, through the same
// code the app uses: read tools through the MCP server's own invoker and
// snapshot answers, edits through `@lib/agentEdits`, feedback through
// `editFeedback`. So the import-cleanup eval measures the agent the app
// actually runs — on real imported pages, in plain Node, at no cost when
// the provider is scripted.
// see docs/plans/builtin-agent-plan.md

import { DEFAULT_BREAKPOINTS, type Breakpoint } from '@shared/types';

import { createToolInvoker } from '../../main/mcp/tools';
import type { ToolResult } from '../../main/mcp/protocol';
import {
  addElement,
  deleteElement,
  editFeedback,
  mergeThemeTokens,
  moveElement,
  planExtraction,
  renameList,
  setShow,
  setAttributes,
  setStyles,
  setTag,
  setText,
  wrapElements,
  type AgentEditContext,
  type AgentEditResult,
} from './agentEdits';
import { answerSnapshotTool, type SnapshotInput, type SnapshotTree } from './canvasSnapshot';
import { replaceSubtreeWithInstancePure } from './componentInstance';
import type { ScampElement } from './element';
import { generateElementId } from './element/tree';
import { generateComponentFromSubtree } from './extractComponent';
import { classNameFor } from './generateCode';
import { parseCode } from './parseCode';
import { parseThemeFile, serializeThemeFile } from './parseTheme';

export type HeadlessState = {
  elements: Record<string, ScampElement>;
  rootId: string;
  themeCss: string;
  /** Components the agent extracted, as the files Scamp would write. */
  components: Record<string, { tsx: string; css: string }>;
};

export type HeadlessOptions = {
  /** The imported view being cleaned up. */
  viewName: string;
  breakpoints?: ReadonlyArray<Breakpoint>;
  /** The page's original, for `scamp_get_import_source`. */
  importSource?: { url: string; html: string; css: string };
  /**
   * A React app's source, for `scamp_get_react_source` — answered by the
   * caller, which has the app's files. see docs/plans/react-import-plan.md
   */
  reactSource?: (target: string, element: string | undefined) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;
};

type AgentAnswer = ToolResult & { summary?: string };

type Edit = (ctx: AgentEditContext, args: Record<string, unknown>) => AgentEditResult;

const EDITS: Readonly<Record<string, Edit>> = {
  scamp_set_styles: (ctx, a) => setStyles(ctx, { ...a, element: a['element'] }),
  scamp_add_element: (ctx, a) => addElement(ctx, { ...a, parent: a['parent'] }),
  scamp_set_text: (ctx, a) => setText(ctx, { element: a['element'], text: a['text'] }),
  scamp_set_tag: (ctx, a) => setTag(ctx, { element: a['element'], tag: a['tag'] }),
  scamp_set_attributes: (ctx, a) => setAttributes(ctx, { element: a['element'], attributes: a['attributes'] }),
  scamp_move_element: (ctx, a) => moveElement(ctx, { ...a, element: a['element'], parent: a['parent'] }),
  scamp_wrap_elements: (ctx, a) => wrapElements(ctx, { ...a, elements: a['elements'] }),
  scamp_delete_element: (ctx, a) => deleteElement(ctx, { element: a['element'] }),
  scamp_set_show: (ctx, a) => setShow(ctx, { element: a['element'], flag: a['flag'], shown: a['shown'] }),
  scamp_rename_list: (ctx, a) => renameList(ctx, { list: a['list'], to: a['to'], row: a['row'], fields: a['fields'] }),
};

const text = (value: string, isError = false): AgentAnswer => ({
  content: [{ type: 'text', text: value }],
  ...(isError ? { isError: true } : {}),
});

export const createHeadlessCanvas = (
  initial: HeadlessState,
  options: HeadlessOptions
): { invoke: (name: string, args: Record<string, unknown>) => Promise<AgentAnswer>; state: () => HeadlessState } => {
  let state: HeadlessState = { ...initial, components: { ...initial.components } };
  const breakpoints = options.breakpoints ?? DEFAULT_BREAKPOINTS;
  const view = options.viewName;

  const snapshotInput = (): SnapshotInput => {
    const trees: Record<string, SnapshotTree> = {
      [view]: { kind: 'view', elements: state.elements, rootId: state.rootId },
    };
    for (const [name, files] of Object.entries(state.components)) {
      const parsed = parseCode(files.tsx, files.css, { breakpoints: [...breakpoints], isComponent: true });
      trees[name] = { kind: 'component', elements: parsed.elements, rootId: parsed.rootId };
    }
    return {
      projectFormat: 'scamp',
      target: { kind: 'view', name: view, tsxPath: `views/${view}/${view}.tsx`, cssPath: `views/${view}/${view}.module.css` },
      elements: state.elements,
      rootElementId: state.rootId,
      selectedIds: [],
      pageNames: [],
      componentNames: Object.keys(state.components),
      viewNames: [view],
      trees,
      themeTokens: parseThemeFile(state.themeCss).tokens,
      themes: [],
      activeThemeId: 'light',
      breakpointId: 'desktop',
      breakpointLabel: 'Desktop',
      canvasWidth: 1440,
    };
  };

  const source = options.importSource;
  const read = createToolInvoker(async (tool, args) => answerSnapshotTool(tool, args, snapshotInput()), {
    listImportSources: async () => (source === undefined ? [] : [{ name: view, url: source.url }]),
    readImportSource: async (name, part) =>
      source === undefined || name !== view
        ? null
        : { text: part === 'html' ? source.html : source.css, truncated: false, path: `(in memory)/${part}`, url: source.url },
  });

  const context = (): AgentEditContext => ({
    elements: state.elements,
    rootId: state.rootId,
    breakpoints,
    isComponent: false,
  });

  const tokenNames = (): string[] => parseThemeFile(state.themeCss).tokens.map((t) => t.name);

  const setThemeTokens = (input: Record<string, unknown>): AgentAnswer => {
    const model = parseThemeFile(state.themeCss);
    const merged = mergeThemeTokens(model.tokens, input['tokens']);
    if (typeof merged === 'string') return text(merged, true);
    if (merged.added.length === 0 && merged.changed.length === 0) return text('Every token already had that value; nothing changed.');
    state = { ...state, themeCss: serializeThemeFile({ ...model, tokens: merged.tokens }, state.themeCss) };
    const summary = `Theme tokens — ${[
      ...(merged.added.length > 0 ? [`added ${merged.added.join(', ')}`] : []),
      ...(merged.changed.length > 0 ? [`changed ${merged.changed.join(', ')}`] : []),
    ].join('; ')}`;
    return { ...text(summary), summary };
  };

  const extract = (input: Record<string, unknown>): AgentAnswer => {
    const plan = planExtraction(
      context(),
      { element: input['element'], name: input['name'], alsoReplace: input['alsoReplace'] },
      Object.keys(state.components)
    );
    if (typeof plan === 'string') return text(plan, true);
    const source = state.elements[plan.id];
    const generated = generateComponentFromSubtree(state.elements, plan.id, plan.name, breakpoints);
    if (source === undefined || generated === null) return text('Scamp couldn’t extract that element.', true);
    let elements = state.elements;
    let replaced = 0;
    for (const id of [plan.id, ...plan.replaceIds]) {
      let instanceId = generateElementId();
      while (elements[instanceId] !== undefined) instanceId = generateElementId();
      const next = replaceSubtreeWithInstancePure(elements, id, plan.name, instanceId);
      if (next !== null) {
        elements = next;
        replaced += 1;
      }
    }
    state = { ...state, elements, components: { ...state.components, [plan.name]: generated } };
    const summary = `Made ${classNameFor(source)} into the component ${plan.name}${
      replaced > 1 ? `, and replaced ${replaced - 1} more with it` : ''
    }`;
    return { ...text(summary), summary };
  };

  const invoke = async (name: string, args: Record<string, unknown>): Promise<AgentAnswer> => {
    if (name === 'scamp_get_react_source') {
      if (options.reactSource === undefined) return text('This page didn’t come from a React app.', true);
      const answer = await options.reactSource(
        typeof args['target'] === 'string' ? args['target'] : '',
        typeof args['element'] === 'string' ? args['element'] : undefined
      );
      return answer.ok ? text(answer.text) : text(answer.error, true);
    }
    if (name === 'scamp_set_theme_tokens') return setThemeTokens(args);
    // One view is loaded here; the app edits any (see agentOffCanvas).
    const asked = typeof args['view'] === 'string' ? args['view'].trim() : '';
    const edits = EDITS[name] !== undefined || name === 'scamp_extract_component' || name === 'scamp_use_component';
    if (edits && asked.length > 0 && asked !== view) {
      return text(`Only ${view} is loaded here.`, true);
    }
    if (name === 'scamp_use_component') return text('No other components are loaded here.', true);
    if (name === 'scamp_extract_component') return extract(args);
    const edit = EDITS[name];
    if (edit === undefined) return read(name, args);
    const result = edit(context(), args);
    if (!result.ok) return text(result.error, true);
    state = { ...state, elements: result.elements };
    const feedback = editFeedback(result, state.rootId, tokenNames());
    return { ...text(feedback.text), summary: feedback.summary };
  };

  return { invoke, state: () => state };
};
