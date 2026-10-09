import { generateCode } from '@lib/generateCode';
import { buildHtmlExport } from '@lib/htmlExport';
import { describeOverflow, locateExportedClass } from '@lib/overflowReport';
import { parseCode } from '@lib/parseCode';
import { componentKindOf, DESKTOP_BREAKPOINT_ID } from '@shared/types';
import { useCanvasStore } from '@store/canvasSlice';
const DEFAULT_WIDTH = 1440;
/**
 * Measures what is saved for anything not on the canvas: an agent over MCP
 * edits files, and a stored tree can lag what it wrote.
 */
export const findOverflow = async (projectPath, target, input) => {
    const { breakpoints } = useCanvasStore.getState();
    const [project, themeCss] = await Promise.all([
        window.scamp.readProject({ folderPath: projectPath }),
        window.scamp.readTheme({ projectPath }),
    ]);
    const parsed = (tsx, css) => {
        try {
            const p = parseCode(tsx, css, { breakpoints, isComponent: true });
            return { elements: p.elements, rootId: p.rootId };
        }
        catch {
            return null;
        }
    };
    const generated = (name, tree, isComponent) => {
        const code = generateCode({ elements: tree.elements, rootId: tree.rootId, pageName: name, cssModuleImportName: name, isComponent, breakpoints });
        return { name, tsxContent: code.tsx, cssContent: code.css };
    };
    const components = [];
    const trees = {};
    for (const file of project.components) {
        if (componentKindOf(file) !== 'component')
            continue;
        const live = file.name === target.name && target.kind === 'component' ? target.live : undefined;
        const tree = live ?? parsed(file.tsxContent, file.cssContent);
        if (tree !== null)
            trees[file.name] = tree;
        components.push(live !== undefined ? generated(file.name, live, true) : { name: file.name, tsxContent: file.tsxContent, cssContent: file.cssContent });
    }
    let page;
    let viewTree;
    if (target.live !== undefined) {
        page = generated(target.name, target.live, target.kind !== 'page');
        viewTree = target.live;
    }
    else {
        const file = project.components.find((c) => c.name === target.name);
        if (file === undefined)
            return { ok: false, text: `No view or component named "${target.name}" is saved.` };
        page = { name: target.name, tsxContent: file.tsxContent, cssContent: file.cssContent };
        viewTree = parsed(file.tsxContent, file.cssContent);
    }
    if (viewTree === null)
        return { ok: false, text: `Scamp couldn’t read ${target.name}’s files.` };
    const { files, skipped } = buildHtmlExport({ projectName: target.name, pages: [{ ...page, name: 'home' }], components, themeCss });
    if (skipped.length > 0)
        return { ok: false, text: `Scamp couldn’t build ${target.name}’s export: ${skipped[0]?.reason ?? ''}` };
    const asked = input['width'];
    const width = typeof asked === 'number' && Number.isFinite(asked) ? asked : (breakpoints.find((b) => b.id === DESKTOP_BREAKPOINT_ID)?.width ?? DEFAULT_WIDTH);
    const measured = await window.scamp.agentMeasureOverflow({ projectPath, files, width });
    if (!measured.ok)
        return { ok: false, text: `Scamp couldn’t measure ${target.name}: ${measured.error}` };
    const view = { name: target.name, kind: target.kind === 'component' ? 'component' : 'view', elements: viewTree.elements };
    const text = describeOverflow(target.name, measured.report, (cls) => locateExportedClass(cls, view, trees));
    const count = measured.report.findings.length + measured.report.more;
    return { ok: true, text, summary: `Measured ${target.name}: ${count === 0 ? 'nothing overflows' : `${count} overflowing`}` };
};
