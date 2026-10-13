import { parseCode } from '@lib/parseCode';
import { ABOUT_NOTES, checkProject, checkTarget, findCheckTarget, rootTagsOf } from '@lib/projectCheck';
import { componentKindOf } from '@shared/types';
import { useCanvasStore } from '@store/canvasSlice';
const relativeTo = (projectPath, path) => {
    const root = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
    const normalized = path.replace(/\\/g, '/');
    return normalized.startsWith(`${root}/`) ? normalized.slice(root.length + 1) : normalized;
};
const gatherTargets = async (projectPath) => {
    const state = useCanvasStore.getState();
    const project = await window.scamp.readProject({ folderPath: projectPath });
    const targets = [];
    const unreadable = [];
    const add = (target, tsx, css, tsxPath) => {
        try {
            const parsed = parseCode(tsx, css, { breakpoints: state.breakpoints, isComponent: target.kind !== 'page' });
            targets.push({ ...target, elements: parsed.elements, rootId: parsed.rootId });
        }
        catch {
            unreadable.push(relativeTo(projectPath, tsxPath));
        }
    };
    for (const page of project.pages)
        add({ name: page.name, kind: 'page' }, page.tsxContent, page.cssContent, page.tsxPath);
    for (const file of project.components) {
        const kind = componentKindOf(file) === 'view' ? 'view' : 'component';
        add({ name: file.name, kind }, file.tsxContent, file.cssContent, file.tsxPath);
    }
    // The open one as it is now, not as it was last saved.
    const open = state.activeComponent ?? state.activePage;
    if (open !== null && state.elements[state.rootElementId] !== undefined) {
        const isPage = state.activeComponent === null;
        const at = targets.findIndex((t) => t.name === open.name && (t.kind === 'page') === isPage);
        const live = {
            name: open.name,
            kind: isPage ? 'page' : (targets[at]?.kind ?? 'component'),
            elements: state.elements,
            rootId: state.rootElementId,
        };
        if (at === -1)
            targets.push(live);
        else
            targets[at] = live;
    }
    return { targets, unreadable };
};
export const answerCheck = async (projectPath, tool, input) => {
    const { targets, unreadable } = await gatherTargets(projectPath);
    const tokens = useCanvasStore.getState().themeTokens.map((token) => token.name);
    if (tool === 'scamp_check_project') {
        const result = checkProject(targets, tokens, unreadable);
        return {
            ok: true,
            text: JSON.stringify(result, null, 2),
            summary: `Checked ${result.checked}: ${result.problems} problem${result.problems === 1 ? '' : 's'} in ${result.withFindings.length}`,
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
    const checked = checkTarget(found, tokens, rootTagsOf(targets));
    return { ok: true, text: JSON.stringify({ ...checked, ...(checked.notes.length > 0 ? { aboutNotes: ABOUT_NOTES } : {}) }, null, 2) };
};
