import { useCanvasStore, type CanvasState } from '@store/canvasSlice';
import {
  buildContextMarkdown,
  type ContextTarget,
} from '@lib/contextMarkdown';

/**
 * Keeps `<project>/.scamp/context.md` in step with the canvas so an agent in
 * the terminal always knows which page is open and what's selected.
 *
 * Deliberately NOT deduplicated against the last written content: re-writing
 * an identical file on every selection is the point. A user often clicks the
 * thing they're about to ask about, and the file's mtime moving is the
 * signal that the context is fresh rather than left over from earlier.
 * see docs/archive/2026-08-05-live-context-file-plan.md
 */

/** Matches the sync bridge's own write debounce for style edits. */
const CONTEXT_DEBOUNCE_MS = 500;

let timer: ReturnType<typeof setTimeout> | null = null;

/** Project-relative, so the file never leaks the user's home directory. */
const relativeTo = (projectPath: string, absolute: string): string => {
  const root = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const path = absolute.replace(/\\/g, '/');
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
};

const targetOf = (state: CanvasState): ContextTarget | null => {
  const { projectPath } = state;
  if (state.activeComponent) {
    return {
      kind: state.activeComponent.kind,
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

const write = (): void => {
  const state = useCanvasStore.getState();
  if (!state.projectPath) return;
  const breakpoint = state.breakpoints.find(
    (b) => b.id === state.activeBreakpointId
  );
  const content = buildContextMarkdown({
    target: targetOf(state),
    elements: state.elements,
    selectedIds: state.selectedElementIds,
    canvasWidth: breakpoint?.width ?? state.breakpoints[0]?.width ?? 0,
    breakpointLabel: breakpoint?.label ?? state.activeBreakpointId,
  });
  // Fire-and-forget. The handler already swallows its own failures; this
  // catch covers the IPC bridge itself going away mid-write (window closing).
  void window.scamp.writeContext({ projectPath: state.projectPath, content })
    .catch(() => {});
};

export const cancelContextWrite = (): void => {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
};

/**
 * Store subscriber. Re-arms a debounce whenever anything the file reports
 * changes — the open target, the selection, or the selected element itself.
 *
 * Watching the selected element's OBJECT IDENTITY rather than the whole
 * `elements` map is what makes "styles changed" work without rewriting on
 * every unrelated edit: the store's spreads hand the edited element a new
 * identity and leave its siblings alone.
 */
export const makeContextFileHandler =
  () =>
  (state: CanvasState, prev: CanvasState): void => {
    const selectedId = state.selectedElementIds[0];
    const prevSelectedId = prev.selectedElementIds[0];
    const changed =
      state.activePage !== prev.activePage ||
      state.activeComponent !== prev.activeComponent ||
      state.projectPath !== prev.projectPath ||
      state.activeBreakpointId !== prev.activeBreakpointId ||
      state.selectedElementIds !== prev.selectedElementIds ||
      (selectedId !== undefined &&
        selectedId === prevSelectedId &&
        state.elements[selectedId] !== prev.elements[selectedId]);
    if (!changed) return;
    cancelContextWrite();
    timer = setTimeout(() => {
      timer = null;
      write();
    }, CONTEXT_DEBOUNCE_MS);
  };

/** Write immediately, skipping the debounce — used on install and teardown. */
export const flushContextWrite = (): void => {
  cancelContextWrite();
  write();
};
