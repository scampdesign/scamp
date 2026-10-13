import { parseCode } from '@lib/parseCode';
import { checkProject, checkTarget, findCheckTarget, type CheckTarget } from '@lib/projectCheck';
import { componentKindOf } from '@shared/types';
import { useCanvasStore } from '@store/canvasSlice';

/**
 * `scamp_check_view` and `scamp_check_project`, for the MCP server and the
 * Scamp Agent. They read every page, view, and component from disk when
 * asked — not a cached copy, which an outside edit could leave behind —
 * and the open one as the canvas shows it, unsaved edits included.
 * see docs/notes/view-lint.md
 */

type CheckAnswer = { ok: boolean; text: string; summary?: string };

const relativeTo = (projectPath: string, path: string): string => {
  const root = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalized = path.replace(/\\/g, '/');
  return normalized.startsWith(`${root}/`) ? normalized.slice(root.length + 1) : normalized;
};

const gatherTargets = async (projectPath: string): Promise<{ targets: CheckTarget[]; unreadable: string[] }> => {
  const state = useCanvasStore.getState();
  const project = await window.scamp.readProject({ folderPath: projectPath });
  const targets: CheckTarget[] = [];
  const unreadable: string[] = [];
  const add = (target: Omit<CheckTarget, 'elements' | 'rootId'>, tsx: string, css: string, tsxPath: string): void => {
    try {
      const parsed = parseCode(tsx, css, { breakpoints: state.breakpoints, isComponent: target.kind !== 'page' });
      targets.push({ ...target, elements: parsed.elements, rootId: parsed.rootId });
    } catch {
      unreadable.push(relativeTo(projectPath, tsxPath));
    }
  };
  for (const page of project.pages) add({ name: page.name, kind: 'page' }, page.tsxContent, page.cssContent, page.tsxPath);
  for (const file of project.components) {
    const kind = componentKindOf(file) === 'view' ? 'view' : 'component';
    add({ name: file.name, kind }, file.tsxContent, file.cssContent, file.tsxPath);
  }

  // The open one as it is now, not as it was last saved.
  const open = state.activeComponent ?? state.activePage;
  if (open !== null && state.elements[state.rootElementId] !== undefined) {
    const isPage = state.activeComponent === null;
    const at = targets.findIndex((t) => t.name === open.name && (t.kind === 'page') === isPage);
    const live: CheckTarget = {
      name: open.name,
      kind: isPage ? 'page' : (targets[at]?.kind ?? 'component'),
      elements: state.elements,
      rootId: state.rootElementId,
    };
    if (at === -1) targets.push(live);
    else targets[at] = live;
  }
  return { targets, unreadable };
};

export const answerCheck = async (
  projectPath: string,
  tool: 'scamp_check_view' | 'scamp_check_project',
  input: Record<string, unknown>
): Promise<CheckAnswer> => {
  const { targets, unreadable } = await gatherTargets(projectPath);
  const tokens = useCanvasStore.getState().themeTokens.map((token) => token.name);

  if (tool === 'scamp_check_project') {
    const result = checkProject(targets, tokens, unreadable);
    const findings = result.withFindings.reduce((sum, r) => sum + r.findings.length, 0);
    return {
      ok: true,
      text: JSON.stringify(result, null, 2),
      summary: `Checked ${result.checked}: ${findings} finding${findings === 1 ? '' : 's'} in ${result.withFindings.length}`,
    };
  }

  const name = String(input['name'] ?? '');
  const found = findCheckTarget(targets, name);
  if (found === null) {
    return {
      ok: true,
      text: `No page, view, or component named "${name}" exists. Call scamp_list_pages or scamp_list_components for the names.`,
    };
  }
  return { ok: true, text: JSON.stringify(checkTarget(found, tokens), null, 2) };
};
