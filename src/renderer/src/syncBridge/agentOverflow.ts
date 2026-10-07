import { generateCode } from '@lib/generateCode';
import type { ScampElement } from '@lib/element';
import { buildHtmlExport, type ExportSourceFile } from '@lib/htmlExport';
import { describeOverflow, locateExportedClass } from '@lib/overflowReport';
import { DESKTOP_BREAKPOINT_ID } from '@shared/types';
import { useCanvasStore } from '@store/canvasSlice';

/**
 * `scamp_find_overflow`: build the view's HTML export from what Scamp
 * holds now — the canvas for the open view, the stored trees for the rest
 * — have main lay it out, and say what overflows.
 * see docs/notes/agent-overflow-check.md
 */

export type OverflowTarget = {
  name: string;
  kind: 'page' | 'view' | 'component';
  elements: Record<string, ScampElement>;
  rootId: string;
};

const DEFAULT_WIDTH = 1440;

export const findOverflow = async (
  projectPath: string,
  target: OverflowTarget,
  input: Record<string, unknown>
): Promise<{ ok: boolean; text: string; summary?: string }> => {
  const { breakpoints, componentTrees } = useCanvasStore.getState();
  // The open component's canvas is newer than its stored tree.
  const trees = target.kind === 'component' ? { ...componentTrees, [target.name]: { ...target, kind: 'component' as const } } : componentTrees;
  const source = (name: string, tree: { elements: Record<string, ScampElement>; rootId: string }, isComponent: boolean): ExportSourceFile => {
    const code = generateCode({ elements: tree.elements, rootId: tree.rootId, pageName: name, cssModuleImportName: name, isComponent, breakpoints });
    return { name, tsxContent: code.tsx, cssContent: code.css };
  };
  const components = Object.entries(trees)
    .filter(([, tree]) => (tree.kind ?? 'component') === 'component')
    .map(([name, tree]) => source(name, tree, true));
  const page = source(target.name, target, target.kind !== 'page');

  const { files, skipped } = buildHtmlExport({
    projectName: target.name,
    pages: [{ ...page, name: 'home' }],
    components,
    themeCss: await window.scamp.readTheme({ projectPath }),
  });
  if (skipped.length > 0) return { ok: false, text: `Scamp couldn’t build ${target.name}’s export: ${skipped[0]?.reason ?? ''}` };

  const asked = input['width'];
  const width = typeof asked === 'number' && Number.isFinite(asked) ? asked : (breakpoints.find((b) => b.id === DESKTOP_BREAKPOINT_ID)?.width ?? DEFAULT_WIDTH);
  const measured = await window.scamp.agentMeasureOverflow({ projectPath, files, width });
  if (!measured.ok) return { ok: false, text: `Scamp couldn’t measure ${target.name}: ${measured.error}` };

  const view = { name: target.name, kind: target.kind === 'component' ? ('component' as const) : ('view' as const), elements: target.elements };
  const text = describeOverflow(target.name, measured.report, (cls) => locateExportedClass(cls, view, trees));
  const count = measured.report.findings.length + measured.report.more;
  return { ok: true, text, summary: `Measured ${target.name}: ${count === 0 ? 'nothing overflows' : `${count} overflowing`}` };
};
