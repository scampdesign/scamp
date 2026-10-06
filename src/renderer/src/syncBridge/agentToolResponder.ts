import {
  addElement,
  deleteElement,
  editFeedback,
  mergeThemeTokens,
  planExtraction,
  renameList,
  setShow,
  moveElement,
  setAttributes,
  setStyles,
  setTag,
  setText,
  wrapElements,
  type AgentEditContext,
  type AgentEditResult,
} from '@lib/agentEdits';
import { generateComponentFromSubtree } from '@lib/extractComponent';
import { classNameFor } from '@lib/generateCode';
import { parseCode } from '@lib/parseCode';
import { parseThemeFile, serializeThemeFile } from '@lib/parseTheme';
import { currentConversationKey, sameConversation, useAgentStore } from '@store/agentSlice';
import { useCanvasStore } from '@store/canvasSlice';
import { useHistoryStore } from '@store/historySlice';

/**
 * Makes the Scamp Agent's edits against the live store. Main asks, this
 * answers — once per request, always, since main is waiting on a timeout.
 *
 * An edit goes through `@lib/agentEdits` (Scamp's own generate → parse
 * round trip) and lands in the store like any panel edit, so the normal
 * save path writes it. A turn's edits are one history transaction: one
 * Cmd+Z undoes everything the agent did for one message.
 * see docs/plans/builtin-agent-plan.md
 */

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

export type AgentEditAnswer = {
  ok: boolean;
  text: string;
  summary?: string;
  /** A component this edit created — main tracks it so Undo AI session can remove it. */
  createdComponent?: string;
};

/** The turn whose history transaction is open, and what it touched. */
let open: { turnId: string; touched: Set<string> } | null = null;

const closeTurn = (): void => {
  if (open === null) return;
  const { touched } = open;
  open = null;
  useHistoryStore
    .getState()
    .endHistoryTransaction({ kind: 'agent-edit', elementIds: [...touched] }, useCanvasStore.getState().elements);
};

/** The turn is over: commit its edits as one undo step. */
export const endAgentTurnHistory = (turnId: string): void => {
  if (open?.turnId === turnId) closeTurn();
};

/** Open this turn's history transaction, closing any other. */
const enterTurn = (turnId: string): Set<string> => {
  if (open?.turnId !== turnId) {
    closeTurn();
    useHistoryStore.getState().beginHistoryTransaction();
    open = { turnId, touched: new Set() };
  }
  return open.touched;
};

const contextFrom = (state: ReturnType<typeof useCanvasStore.getState>): AgentEditContext => ({
  elements: state.elements,
  rootId: state.rootElementId,
  breakpoints: state.breakpoints,
  isComponent: state.activeComponent?.kind === 'component',
});

/** Add or change theme tokens in theme.css — not in the undo stack, so said so. */
const setThemeTokens = async (projectPath: string, input: Record<string, unknown>): Promise<AgentEditAnswer> => {
  const existing = await window.scamp.readTheme({ projectPath });
  const model = parseThemeFile(existing);
  const merged = mergeThemeTokens(model.tokens, input['tokens']);
  if (typeof merged === 'string') return { ok: false, text: merged };
  if (merged.added.length === 0 && merged.changed.length === 0) {
    return { ok: true, text: 'Every token already had that value; nothing changed.', summary: 'Theme tokens unchanged' };
  }
  const next = { ...model, tokens: merged.tokens };
  useCanvasStore.getState().setThemeData(next);
  await window.scamp.writeTheme({ projectPath, content: serializeThemeFile(next, existing) });
  const summary = [
    ...(merged.added.length > 0 ? [`added ${merged.added.join(', ')}`] : []),
    ...(merged.changed.length > 0 ? [`changed ${merged.changed.join(', ')}`] : []),
  ].join('; ');
  return {
    ok: true,
    summary: `Theme tokens — ${summary}`,
    text: `Theme tokens — ${summary}\nTheme changes aren't in Cmd+Z; Undo AI changes reverts them.`,
  };
};

/** A container into a component, and any look-alikes into instances of it. */
const extractComponent = async (
  projectPath: string,
  input: Record<string, unknown>,
  turnId: string
): Promise<AgentEditAnswer> => {
  const state = useCanvasStore.getState();
  const plan = planExtraction(
    contextFrom(state),
    { element: input['element'], name: input['name'], alsoReplace: input['alsoReplace'] },
    Object.keys(state.componentTrees)
  );
  if (typeof plan === 'string') return { ok: false, text: plan };
  const source = state.elements[plan.id];
  const generated = generateComponentFromSubtree(state.elements, plan.id, plan.name, state.breakpoints);
  if (source === undefined || generated === null) return { ok: false, text: 'Scamp couldn’t extract that element.' };

  await window.scamp.createComponent({
    projectPath,
    componentName: plan.name,
    tsxContent: generated.tsx,
    cssContent: generated.css,
  });
  // Rendered at once from the files just written; the project re-read
  // main triggers next adds it to the sidebar.
  const parsed = parseCode(generated.tsx, generated.css, { breakpoints: state.breakpoints, isComponent: true });
  state.setComponentTrees({
    ...state.componentTrees,
    [plan.name]: { elements: parsed.elements, rootId: parsed.rootId, kind: 'component' },
  });

  const touched = enterTurn(turnId);
  const replaced: string[] = [];
  for (const id of [plan.id, ...plan.replaceIds]) {
    const el = useCanvasStore.getState().elements[id];
    if (el === undefined) continue;
    const instanceId = useCanvasStore.getState().replaceSubtreeWithInstance(id, plan.name);
    if (instanceId !== null) {
      touched.add(instanceId);
      replaced.push(classNameFor(el));
    }
  }
  const others = replaced.length - 1;
  const summary = `Made ${classNameFor(source)} into the component ${plan.name}${
    others > 0 ? `, and replaced ${others} more with it` : ''
  }`;
  return { ok: true, summary, text: summary, createdComponent: plan.name };
};

/** Make one edit, for turn `turnId`. Exported for tests. */
export const executeAgentEdit = async (
  tool: string,
  input: Record<string, unknown>,
  turnId: string
): Promise<AgentEditAnswer> => {
  const state = useCanvasStore.getState();
  if (!state.projectPath) return { ok: false, text: 'No project is open in Scamp.' };
  if (state.snapshotPreview !== null) {
    return { ok: false, text: 'Scamp is showing a snapshot preview, which is read-only. Ask the user to exit it.' };
  }
  // Scamp edits whatever is open, so a turn whose user has since gone to
  // another page must not land its edits there.
  const running = useAgentStore.getState().runningTurn;
  const open = currentConversationKey();
  if (running !== null && running.turnId === turnId && !sameConversation(running.conversation, open)) {
    const from = running.conversation.name;
    return {
      ok: false,
      text: `The user left ${from} for ${open?.name ?? 'another page'}, and Scamp edits whatever is open, so this edit wasn't made. Stop, and tell the user to go back to ${from} to continue.`,
    };
  }
  if (tool === 'scamp_set_theme_tokens') return setThemeTokens(state.projectPath, input);
  if (tool === 'scamp_extract_component') return extractComponent(state.projectPath, input, turnId);

  const edit = EDITS[tool];
  if (edit === undefined) return { ok: false, text: `Unknown edit: ${tool}` };
  const result = edit(contextFrom(state), input);
  if (!result.ok) return { ok: false, text: result.error };

  const turnTouched = enterTurn(turnId);
  for (const id of result.touched) turnTouched.add(id);
  state.applyAgentElements(result.elements, result.touched);

  const feedback = editFeedback(
    result,
    state.rootElementId,
    state.themeTokens.map((token) => token.name)
  );
  return { ok: true, summary: feedback.summary, text: feedback.text };
};

export const installAgentToolResponder = (): (() => void) =>
  window.scamp.onAgentToolCall(({ requestId, tool, args }) => {
    void executeAgentEdit(tool, args.input, args.turnId)
      .then((answer) => window.scamp.sendAgentToolResult({ requestId, ok: true, data: answer }))
      .catch((err: unknown) =>
        window.scamp.sendAgentToolResult({
          requestId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      );
  });
