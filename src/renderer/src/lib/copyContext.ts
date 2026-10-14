import { useCanvasStore } from '@store/canvasSlice';
import { buildContextInline } from '@lib/contextInline';
import type { ContextTarget } from '@lib/contextModel';

/**
 * "Copy context" — puts a one-line description of the selection on the OS
 * clipboard, for pasting in front of a terminal question.
 *
 * Shared by the element right-click menu and the `Cmd/Ctrl+Shift+C` shortcut
 * so the two can't diverge on what gets copied.
 *
 * The shortcut is the only route to the PAGE-level string: right-clicking
 * always selects an element first, so the menu can only ever describe one.
 * see docs/archive/2026-08-06-copy-context-button-plan.md
 */

/** Project-relative, so the copied text never leaks a home directory. */
const relativeTo = (projectPath: string, absolute: string): string => {
  const root = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const path = absolute.replace(/\\/g, '/');
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
};

const targetOf = (state: ReturnType<typeof useCanvasStore.getState>):
  ContextTarget | null => {
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

/** The string that would be copied right now. Exported for tests. */
export const currentContextString = (): string => {
  const state = useCanvasStore.getState();
  const breakpoint = state.breakpoints.find(
    (b) => b.id === state.activeBreakpointId
  );
  return buildContextInline({
    target: targetOf(state),
    elements: state.elements,
    selectedIds: state.selectedElementIds,
    canvasWidth: breakpoint?.width ?? state.breakpoints[0]?.width ?? 0,
    breakpointLabel: breakpoint?.label ?? state.activeBreakpointId,
  });
};

/** Copy it. Resolves false when the write failed, so callers can skip the
 *  "Copied" confirmation rather than claim something that didn't happen. */
export const copyContextToClipboard = async (): Promise<boolean> => {
  try {
    await window.scamp.writeClipboard({ text: currentContextString() });
    return true;
  } catch {
    return false;
  }
};
