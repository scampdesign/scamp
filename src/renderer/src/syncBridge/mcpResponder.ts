import { answerSnapshotTool, type SnapshotInput } from '@lib/canvasSnapshot';
import type { ContextTarget } from '@lib/contextModel';
import { useCanvasStore, type CanvasState } from '@store/canvasSlice';

import { patchLog } from './patchStream';

/**
 * Answers MCP tool calls from the main process out of live store state.
 *
 * The renderer half of the pull-through described in the plan: main holds no
 * canvas cache, so every answer here is read at the moment the agent asks.
 * That is the whole point — an agent querying right after the user clicks
 * must not be told about the previous selection.
 *
 * Every query MUST get exactly one reply: main is waiting on a 2s timeout,
 * and a dropped reply turns into a spurious "canvas did not respond".
 * see docs/archive/2026-08-06-mcp-server-plan.md
 */

/** Project-relative, so no path we hand an agent leaks a home directory. */
const relativeTo = (projectPath: string, absolute: string): string => {
  const root = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const path = absolute.replace(/\\/g, '/');
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
};

const targetOf = (state: CanvasState): ContextTarget | null => {
  const { projectPath } = state;
  if (state.activeComponent) {
    return {
      kind: 'component',
      name: state.activeComponent.name,
      tsxPath: relativeTo(projectPath, state.activeComponent.tsxPath),
      cssPath: relativeTo(projectPath, state.activeComponent.cssPath),
    };
  }
  if (state.activePage) {
    return {
      kind: 'page',
      name: state.activePage.name,
      tsxPath: relativeTo(projectPath, state.activePage.tsxPath),
      cssPath: relativeTo(projectPath, state.activePage.cssPath),
    };
  }
  return null;
};

/** Everything the tools need, read from the store in one pass. */
export const snapshotInputFrom = (state: CanvasState): SnapshotInput => {
  const breakpoint = state.breakpoints.find(
    (b) => b.id === state.activeBreakpointId
  );
  return {
    projectFormat: state.projectFormat,
    target: targetOf(state),
    elements: state.elements,
    rootElementId: state.rootElementId,
    selectedIds: state.selectedElementIds,
    pageNames: state.pageNames,
    componentNames: Object.entries(state.componentTrees)
      .filter(([, tree]) => (tree.kind ?? 'component') === 'component')
      .map(([name]) => name),
    viewNames: Object.entries(state.componentTrees)
      .filter(([, tree]) => tree.kind === 'view')
      .map(([name]) => name),
    trees: Object.fromEntries(
      Object.entries(state.componentTrees).map(([name, tree]) => [
        name,
        { kind: tree.kind ?? 'component', elements: tree.elements, rootId: tree.rootId },
      ])
    ),
    themeTokens: state.themeTokens,
    themes: state.themes,
    activeThemeId: state.activeThemeId,
    breakpointId: state.activeBreakpointId,
    breakpointLabel: breakpoint?.label ?? state.activeBreakpointId,
    canvasWidth: breakpoint?.width ?? state.breakpoints[0]?.width ?? 0,
    recentEdits: patchLog.entries(),
  };
};

/**
 * Install the responder. Returns an unsubscribe for teardown.
 */
export const installMcpResponder = (): (() => void) =>
  window.scamp.onMcpQuery(({ requestId, tool, args }) => {
    try {
      const state = useCanvasStore.getState();
      if (!state.projectPath) {
        window.scamp.sendMcpQueryResult({
          requestId,
          ok: false,
          error: 'No project is currently open in Scamp.',
        });
        return;
      }
      const data = answerSnapshotTool(tool, args, snapshotInputFrom(state));
      window.scamp.sendMcpQueryResult({ requestId, ok: true, data });
    } catch (err) {
      // Catch-all rather than letting it throw: an unanswered query leaves
      // main to time out, which reports "the canvas did not respond" — true
      // but useless. The real message is far more actionable.
      window.scamp.sendMcpQueryResult({
        requestId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
