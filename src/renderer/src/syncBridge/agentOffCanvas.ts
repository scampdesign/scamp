import {
  editFeedback,
  planExtraction,
  planInstanceSwap,
  type AgentEditContext,
  type AgentEditResult,
} from '@lib/agentEdits';
import { replaceSubtreeWithInstancePure } from '@lib/componentInstance';
import type { ScampElement } from '@lib/element';
import { generateElementId } from '@lib/element/tree';
import { generateComponentFromSubtree } from '@lib/extractComponent';
import { classNameFor, generateCode } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { isSupportedContract } from '@shared/projectConfig';
import type { ComponentKind } from '@shared/types';
import { useCanvasStore } from '@store/canvasSlice';

import { cssWriteFor } from './cssWrite';
import { tsxWriteFor } from './tsxWrite';

/**
 * The Scamp Agent's edits to a view or component that isn't open on the
 * canvas: read its files, make the edit through `@lib/agentEdits`, write
 * them back with the same incremental patch a save uses.
 * see docs/notes/agent-whole-project.md
 */

export type OffCanvasAnswer = {
  ok: boolean;
  text: string;
  summary?: string;
  createdComponent?: string;
  /** The files changed behind the canvas — main re-reads the project. */
  refreshProject?: boolean;
};

type Draft = {
  name: string;
  kind: ComponentKind;
  tsxPath: string;
  cssPath: string;
  /** What disk holds, as this turn last read or wrote it. */
  tsx: string;
  css: string;
  elements: Record<string, ScampElement>;
  rootId: string;
  customMediaBlocks: string[];
  keyframesBlocks: ReturnType<typeof parseCode>['keyframesBlocks'];
};

/** This turn's views, so each edit builds on the last without re-reading. */
const drafts = new Map<string, Draft>();
let queue: Promise<unknown> = Promise.resolve();

/** One at a time: a turn's edits arrive together, and each starts from the last one's files. */
const serially = <T>(work: () => Promise<T>): Promise<T> => {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
};

/** The turn is over; the next one reads the files again. */
export const forgetOffCanvasDrafts = (): void => {
  drafts.clear();
};

/** The view is on the canvas now, so the canvas is its truth. */
export const forgetOffCanvasDraft = (name: string): void => {
  drafts.delete(name);
};

const loadDraft = async (projectPath: string, name: string, kind: ComponentKind): Promise<Draft | string> => {
  const held = drafts.get(name);
  if (held !== undefined) return held;
  const file = await window.scamp.readComponent({ projectPath, componentName: name, kind });
  if (file === null) return `Scamp couldn’t read ${name}’s files.`;
  const parsed = parseCode(file.tsxContent, file.cssContent, {
    breakpoints: useCanvasStore.getState().breakpoints,
    isComponent: true,
  });
  if (parsed.viewMeta && !isSupportedContract(parsed.viewMeta.contract)) {
    return `${name} was written for a newer version of Scamp, so it can’t be edited here.`;
  }
  const draft: Draft = {
    name,
    kind,
    tsxPath: file.tsxPath,
    cssPath: file.cssPath,
    tsx: file.tsxContent,
    css: file.cssContent,
    elements: parsed.elements,
    rootId: parsed.rootId,
    customMediaBlocks: parsed.customMediaBlocks,
    keyframesBlocks: parsed.keyframesBlocks,
  };
  drafts.set(name, draft);
  return draft;
};

/** Write the draft's new elements, patching only what changed. Null when written. */
const writeDraft = async (draft: Draft, elements: Record<string, ScampElement>): Promise<string | null> => {
  const { breakpoints } = useCanvasStore.getState();
  const code = generateCode({
    elements,
    rootId: draft.rootId,
    pageName: draft.name,
    cssModuleImportName: draft.name,
    isComponent: true,
    breakpoints,
    customMediaBlocks: draft.customMediaBlocks,
    pageKeyframesBlocks: draft.keyframesBlocks,
  });
  const css = cssWriteFor({ baseCss: draft.css, generatedCss: code.css, tsx: code.tsx, breakpoints, isComponent: true }).css;
  const tsx = tsxWriteFor({ baseTsx: draft.tsx, generatedTsx: code.tsx, css: code.css, breakpoints, isComponent: true }).tsx;
  const written = await window.scamp.writeFile({
    tsxPath: draft.tsxPath,
    cssPath: draft.cssPath,
    tsxContent: tsx,
    cssContent: css,
    // Something else may have written the view since this turn read it.
    expectedTsxContent: draft.tsx,
    expectedCssContent: draft.css,
  });
  if (!written.ok) {
    drafts.delete(draft.name);
    return `${draft.name} changed on disk while you were editing it, so this edit wasn't made. Read its tree again and redo it.`;
  }
  drafts.set(draft.name, { ...draft, tsx, css, elements });
  const store = useCanvasStore.getState();
  store.setComponentTrees({
    ...store.componentTrees,
    [draft.name]: { elements, rootId: draft.rootId, kind: draft.kind },
  });
  return null;
};

const where = (draft: Draft): string =>
  `Made in ${draft.name}, which isn't open on the canvas. Cmd+Z doesn't reach it; Undo AI changes does.`;

/** An element edit — the same `@lib/agentEdits` call the canvas makes — on another view. */
export const editOffCanvas = (
  projectPath: string,
  name: string,
  kind: ComponentKind,
  edit: (ctx: AgentEditContext) => AgentEditResult
): Promise<OffCanvasAnswer> =>
  serially(async () => {
    const draft = await loadDraft(projectPath, name, kind);
    if (typeof draft === 'string') return { ok: false, text: draft };
    const result = edit({
      elements: draft.elements,
      rootId: draft.rootId,
      breakpoints: useCanvasStore.getState().breakpoints,
      isComponent: kind === 'component',
    });
    if (!result.ok) return { ok: false, text: result.error };
    const failed = await writeDraft(draft, result.elements);
    if (failed !== null) return { ok: false, text: failed };
    const feedback = editFeedback(
      result,
      draft.rootId,
      useCanvasStore.getState().themeTokens.map((token) => token.name)
    );
    return {
      ok: true,
      summary: `${name}: ${feedback.summary}`,
      text: `${feedback.text}\n${where(draft)}`,
      refreshProject: true,
    };
  });

const freshId = (elements: Record<string, ScampElement>): string => {
  let id = generateElementId();
  while (elements[id] !== undefined) id = generateElementId();
  return id;
};

/** Swap containers on another view for instances of `component`. */
const swapIn = (
  elements: Record<string, ScampElement>,
  ids: ReadonlyArray<string>,
  component: string
): { elements: Record<string, ScampElement>; replaced: string[] } => {
  let next = elements;
  const replaced: string[] = [];
  for (const id of ids) {
    const el = next[id];
    const swapped = el === undefined ? null : replaceSubtreeWithInstancePure(next, id, component, freshId(next));
    if (el !== undefined && swapped !== null) {
      next = swapped;
      replaced.push(classNameFor(el));
    }
  }
  return { elements: next, replaced };
};

/** `scamp_use_component` on another view. */
export const swapInOffCanvas = (
  projectPath: string,
  name: string,
  kind: ComponentKind,
  input: Record<string, unknown>
): Promise<OffCanvasAnswer> =>
  serially(async () => {
    const draft = await loadDraft(projectPath, name, kind);
    if (typeof draft === 'string') return { ok: false, text: draft };
    const trees = useCanvasStore.getState().componentTrees;
    const components = Object.keys(trees).filter((n) => trees[n] !== undefined && (trees[n]?.kind ?? 'component') === 'component');
    const plan = planInstanceSwap(
      { elements: draft.elements, rootId: draft.rootId, breakpoints: useCanvasStore.getState().breakpoints, isComponent: kind === 'component' },
      { element: input['element'], component: input['component'] },
      components,
      kind === 'component' ? name : null
    );
    if (typeof plan === 'string') return { ok: false, text: plan };
    const { elements, replaced } = swapIn(draft.elements, [plan.id], plan.name);
    if (replaced.length === 0) return { ok: false, text: 'Scamp couldn’t replace that element.' };
    const failed = await writeDraft(draft, elements);
    if (failed !== null) return { ok: false, text: failed };
    const summary = `${name}: replaced ${replaced.join(', ')} with ${plan.name}`;
    return { ok: true, summary, text: `${summary}\n${where(draft)}`, refreshProject: true };
  });

/** `scamp_extract_component` on another view. */
export const extractOffCanvas = (
  projectPath: string,
  name: string,
  kind: ComponentKind,
  input: Record<string, unknown>
): Promise<OffCanvasAnswer> =>
  serially(async () => {
    const draft = await loadDraft(projectPath, name, kind);
    if (typeof draft === 'string') return { ok: false, text: draft };
    const { breakpoints, componentTrees } = useCanvasStore.getState();
    const plan = planExtraction(
      { elements: draft.elements, rootId: draft.rootId, breakpoints, isComponent: kind === 'component' },
      { element: input['element'], name: input['name'], alsoReplace: input['alsoReplace'] },
      Object.keys(componentTrees)
    );
    if (typeof plan === 'string') return { ok: false, text: plan };
    const generated = generateComponentFromSubtree(draft.elements, plan.id, plan.name, breakpoints);
    if (generated === null) return { ok: false, text: 'Scamp couldn’t extract that element.' };
    await window.scamp.createComponent({
      projectPath,
      componentName: plan.name,
      tsxContent: generated.tsx,
      cssContent: generated.css,
    });
    const parsed = parseCode(generated.tsx, generated.css, { breakpoints, isComponent: true });
    useCanvasStore.getState().setComponentTrees({
      ...useCanvasStore.getState().componentTrees,
      [plan.name]: { elements: parsed.elements, rootId: parsed.rootId, kind: 'component' },
    });
    const { elements, replaced } = swapIn(draft.elements, [plan.id, ...plan.replaceIds], plan.name);
    const failed = await writeDraft(draft, elements);
    if (failed !== null) return { ok: false, text: failed, createdComponent: plan.name };
    const others = replaced.length - 1;
    const summary = `${name}: made ${replaced[0] ?? plan.id} into the component ${plan.name}${
      others > 0 ? `, and replaced ${others} more with it` : ''
    }`;
    return { ok: true, summary, text: `${summary}\n${where(draft)}`, createdComponent: plan.name, refreshProject: true };
  });
