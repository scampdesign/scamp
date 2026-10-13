import { viewSlugFor } from '@shared/templates';
import { buildContextModel, } from './contextModel';
import { isGridTable, tableCaptionRule, tableSubgridRule } from './tableGrid';
import { tableStyleRules } from './tableStyle';
import { lintView } from './viewLint';
import { checkProject, checkTarget } from './projectCheck';
import { findGuidanceSection, guidanceFor, guidanceSectionTitles, guidanceSummary, } from '@shared/templates';
import { classNameFor, tagFor } from './generateCode';
import { collectViewProps, propsTypeSource, viewEventNames, } from './viewProps';
/**
 * Ceiling on elements returned by `get_canvas_state`.
 *
 * The whole map on a busy page runs to tens of kilobytes, and it lands
 * directly in the agent's context window. Agents reach for the broadest tool
 * first, so an uncapped version would be the expensive default rather than
 * the considered choice. A truncated answer that SAYS it was truncated beats
 * both an unbounded one and no tool at all.
 */
export const CANVAS_STATE_ELEMENT_LIMIT = 200;
/**
 * Project-relative POSIX paths for a page.
 *
 * Mirrors `main/ipc/pageOps.ts` → `pagePathsFor`, which is the source of
 * truth for where pages live. Duplicated rather than imported because that
 * one builds ABSOLUTE paths with `path.join` — backslashes on Windows, and a
 * leaked home directory in text an agent will quote back.
 */
export const pagePathsRelative = (pageName, format) => {
    if (format === 'legacy') {
        return { tsx: `${pageName}.tsx`, css: `${pageName}.module.css` };
    }
    if (pageName === 'home') {
        return { tsx: 'app/page.tsx', css: 'app/page.module.css' };
    }
    return {
        tsx: `app/${pageName}/page.tsx`,
        css: `app/${pageName}/page.module.css`,
    };
};
/** Mirrors `main/ipc/componentOps.ts` → `componentPathsFor`. */
export const componentPathsRelative = (name) => ({
    tsx: `components/${name}/${name}.tsx`,
    css: `components/${name}/${name}.module.css`,
});
/** Mirrors `main/ipc/componentOps.ts` → `componentPathsFor` for views. */
export const viewPathsRelative = (name) => ({
    tsx: `views/${name}/${name}.tsx`,
    css: `views/${name}/${name}.module.css`,
});
/** A table's derived rules, or nothing. see `ElementResult.tableRules` */
const tableRulesOf = (el) => {
    if (el.tag !== 'table')
        return {};
    const cls = classNameFor(el);
    const rules = [
        ...(isGridTable(el) ? [tableSubgridRule(cls), tableCaptionRule(cls)] : []),
        ...tableStyleRules(cls, el.tableStyle),
    ];
    return rules.length > 0 ? { tableRules: rules } : {};
};
/** `ContextElement` → the tool's element shape. */
const toElementResult = (el, source) => ({
    id: el.id,
    class: el.className,
    tag: el.tag,
    ...(el.name !== undefined ? { name: el.name } : {}),
    parentId: source.parentId,
    childIds: [...source.childIds],
    styles: el.styles,
    customProperties: Object.fromEntries(el.customProperties),
    ...tableRulesOf(source),
});
/**
 * Describe one element by id, via the shared model.
 *
 * Routing through `buildContextModel` rather than reading the element
 * directly is deliberate: it's what guarantees the MCP answer and the context
 * file report the same declarations, including the custom-property split.
 */
const describeById = (input, id) => {
    const source = input.elements[id];
    if (source === undefined)
        return null;
    const model = buildContextModel({
        target: input.target,
        elements: input.elements,
        selectedIds: [id],
        canvasWidth: input.canvasWidth,
        breakpointLabel: input.breakpointLabel,
    });
    return model.element === null ? null : toElementResult(model.element, source);
};
export const getActiveTarget = (input) => {
    const { target } = input;
    if (target === null)
        return null;
    return {
        kind: target.kind,
        name: target.name,
        tsx: target.tsxPath,
        css: target.cssPath,
    };
};
export const getSelectedElement = (input) => {
    const primary = input.selectedIds[0];
    return primary === undefined ? null : describeById(input, primary);
};
export const getElementById = (input, id) => describeById(input, id);
/**
 * The tree, ids and tags only.
 *
 * Deliberately style-free — this is the cheap structural tool an agent uses
 * to orient before pulling detail with `get_element_by_id`. Adding styles
 * here would make it another `get_canvas_state`.
 */
export const getElementTree = (input) => {
    const root = input.elements[input.rootElementId];
    if (root === undefined)
        return null;
    // Iterative with a seen-set: a corrupt parent/child cycle would otherwise
    // recurse until the stack blows, and this runs on live in-memory state
    // that an external edit may have just reshaped.
    const seen = new Set();
    const build = (el) => {
        seen.add(el.id);
        const children = [];
        for (const childId of el.childIds) {
            if (seen.has(childId))
                continue;
            const child = input.elements[childId];
            if (child !== undefined)
                children.push(build(child));
        }
        return { id: el.id, class: classNameFor(el), tag: tagFor(el), children };
    };
    return { root: build(root) };
};
export const listPages = (input) => [
    ...input.pageNames.map((name) => ({
        name,
        kind: 'page',
        ...pagePathsRelative(name, input.projectFormat),
    })),
    ...(input.viewNames ?? []).map((view) => ({
        name: viewSlugFor(view),
        kind: 'view',
        view,
        ...viewPathsRelative(view),
    })),
];
/**
 * The props a view or component accepts, from its live tree.
 *
 * `name` is the PascalCase file name, or — because `scamp_list_pages`
 * reports a view by its route slug — that slug. The type text comes
 * from the same formatter the generator uses, so what the agent reads
 * here is byte-for-byte what the file declares.
 */
/**
 * A view or component by name or route slug. The one open on the canvas
 * is read from the canvas itself: its stored tree is how it was when the
 * project loaded, so an agent checking its own edits saw none of them.
 */
/** The stored tree's name for a view or component name, or a view's route slug. */
export const treeNameFor = (trees, name) => {
    if (trees[name] !== undefined)
        return name;
    return Object.keys(trees).find((candidate) => trees[candidate]?.kind === 'view' && viewSlugFor(candidate) === name) ?? null;
};
const treeNamed = (input, name) => {
    const trees = input.trees ?? {};
    const match = treeNameFor(trees, name) ?? undefined;
    const tree = match === undefined ? undefined : trees[match];
    if (match === undefined || tree === undefined)
        return null;
    const open = input.target;
    if (open !== null && open.kind !== 'page' && open.name === match) {
        return { name: match, tree: { kind: tree.kind, elements: input.elements, rootId: input.rootElementId } };
    }
    return { name: match, tree };
};
export const getViewProps = (input, name) => {
    const found = treeNamed(input, name);
    if (found === null)
        return null;
    const { name: match, tree } = found;
    const props = collectViewProps(tree.elements, tree.rootId);
    const samples = {};
    for (const prop of props) {
        if (prop.defaultValue !== undefined)
            samples[prop.name] = prop.defaultValue;
    }
    return {
        name: match,
        kind: tree.kind,
        ...(tree.kind === 'view' ? viewPathsRelative(match) : componentPathsRelative(match)),
        propsType: propsTypeSource(`${match}Props`, props),
        props: props.map((p) => ({
            name: p.name,
            kind: p.kind,
            type: p.tsType,
            ...(p.defaultValue !== undefined ? { default: p.defaultValue } : {}),
        })),
        events: viewEventNames(props),
        // Problems only: a note is valid CSS, not something the view lost.
        warnings: lintView({
            elements: tree.elements,
            rootId: tree.rootId,
            themeTokens: input.themeTokens.map((token) => token.name),
            componentRootTags: rootTagsFrom(input),
        }).filter((f) => f.severity === 'problem'),
        samples,
    };
};
/**
 * Components by name and path.
 *
 * No `variants` field: variants aren't on `main` yet, and a field an agent is
 * told to expect but always finds empty reads as "this component has none".
 * Adding it later is additive.
 */
export const listComponents = (input) => input.componentNames.map((name) => ({
    name,
    ...componentPathsRelative(name),
}));
/**
 * Theme tokens exactly as they sit in `theme.css` — a flat list, not grouped
 * into colours / typography / spacing.
 *
 * The agent reading this is usually about to EDIT that file. Inventing a
 * structure the file doesn't have would leave it editing against the wrong
 * shape, and the grouping would have to be guessed from name prefixes, which
 * breaks silently the first time a token is named unconventionally.
 */
/**
 * What a view lost on the way into the canvas. Answers the same names
 * `scamp_get_view_props` takes, so an agent that just wrote a view can
 * check it without first working out what Scamp calls the thing.
 * see docs/notes/view-lint.md
 */
export const getViewCheck = (input, name) => {
    const found = treeNamed(input, name);
    if (found === null)
        return null;
    const { name: match, tree } = found;
    const { findings, notes } = checkTarget({ name: match, kind: tree.kind, elements: tree.elements, rootId: tree.rootId }, input.themeTokens.map((token) => token.name), rootTagsFrom(input));
    return { name: match, kind: tree.kind, findings, notes };
};
/** Each component's root tag, so an instance is checked as what it renders. */
const rootTagsFrom = (input) => Object.fromEntries(Object.entries(input.trees ?? {}).map(([name, tree]) => [name, tree.elements[tree.rootId]?.tag]));
/**
 * Every view and component in the snapshot. The app answers this from
 * disk, plain pages included (syncBridge/agentChecks.ts); this is the
 * headless runner's answer, which has only the trees it was given.
 */
export const getProjectCheck = (input) => checkProject(Object.keys(input.trees ?? {}).flatMap((name) => {
    const found = treeNamed(input, name);
    return found === null
        ? []
        : [{ name: found.name, kind: found.tree.kind, elements: found.tree.elements, rootId: found.tree.rootId }];
}), input.themeTokens.map((token) => token.name));
/**
 * The project's own guidance, sliced. Answers from the same templates
 * that write `agent.md`, so an agent that asks and one that reads the
 * file get the same rules. see docs/notes/agent-md-layouts.md
 */
export const getConventions = (input, section) => {
    const md = guidanceFor(input.projectFormat);
    return {
        format: input.projectFormat,
        sections: guidanceSectionTitles(md),
        summary: guidanceSummary(md),
        ...(section.length > 0 ? { section: findGuidanceSection(md, section) } : {}),
    };
};
export const getThemeTokens = (input) => ({
    tokens: input.themeTokens.map(({ name, value }) => ({ name, value })),
    themes: input.themes.map(({ id, label }) => ({ id, label })),
    activeThemeId: input.activeThemeId,
});
/**
 * The input as if `view` were open on the canvas, so the element reads
 * answer about any view or component, not only the open one. No `view`,
 * or the open one, reads the canvas. Throws for a name that isn't there.
 */
export const inputForView = (input, view) => {
    if (typeof view !== 'string' || view.trim().length === 0)
        return input;
    const found = treeNamed(input, view.trim());
    if (found === null) {
        throw new Error(`No view or component named "${view}". scamp_list_pages (the \`view\` field) and scamp_list_components list them.`);
    }
    if (input.target !== null && input.target.name === found.name)
        return input;
    const paths = found.tree.kind === 'view' ? viewPathsRelative(found.name) : componentPathsRelative(found.name);
    return {
        ...input,
        target: { kind: found.tree.kind, name: found.name, tsxPath: paths.tsx, cssPath: paths.css },
        elements: found.tree.elements,
        rootElementId: found.tree.rootId,
        selectedIds: [],
    };
};
/**
 * Map an MCP tool name onto its snapshot function.
 *
 * Lives here rather than in the renderer's IPC responder so the whole tool
 * surface is testable without a window — the responder becomes "read store,
 * call this, reply".
 *
 * Throws on an unknown name: the protocol layer has already checked it, so
 * reaching here means the two lists have drifted, and a thrown error surfaces
 * that as an `isError` result rather than a confusing `null`.
 */
export const answerSnapshotTool = (tool, args, input) => {
    switch (tool) {
        case 'scamp_get_active_page':
            return getActiveTarget(input);
        case 'scamp_get_selected_element':
            return getSelectedElement(input);
        case 'scamp_get_element_by_id':
            return getElementById(inputForView(input, args['view']), String(args['id'] ?? ''));
        case 'scamp_get_element_tree':
            return getElementTree(inputForView(input, args['view']));
        case 'scamp_get_canvas_state':
            return getCanvasState(input);
        case 'scamp_list_pages':
            return listPages(input);
        case 'scamp_list_components':
            return listComponents(input);
        case 'scamp_get_theme_tokens':
            return getThemeTokens(input);
        case 'scamp_get_view_props':
            return getViewProps(input, String(args['name'] ?? ''));
        case 'scamp_check_view':
            return getViewCheck(input, String(args['name'] ?? ''));
        case 'scamp_check_project':
            return getProjectCheck(input);
        case 'scamp_get_conventions':
            return getConventions(input, String(args['section'] ?? ''));
        case 'scamp_get_recent_edits':
            return getRecentEdits(input, Number(args['since'] ?? 0));
        default:
            throw new Error(`Unknown snapshot tool: ${tool}`);
    }
};
/** Long enough to read, short enough not to flood an agent's context. */
const MAX_HUNK_CHARS = 1000;
/**
 * What the designer changed, in lines rather than offsets: an agent has
 * the file, not the version the offsets were taken against.
 */
export const getRecentEdits = (input, since) => {
    const all = input.recentEdits ?? [];
    const from = Number.isFinite(since) && since > 0 ? since : 0;
    const saves = all.filter((entry) => entry.revision > from);
    return {
        revision: all.length > 0 ? (all[all.length - 1]?.revision ?? 0) : 0,
        saves: saves.map((entry) => ({
            revision: entry.revision,
            at: new Date(entry.at).toISOString(),
            target: entry.target,
            kind: entry.kind,
            files: entry.files.map((file) => ({
                path: file.path,
                changes: file.hunks.map((hunk) => ({
                    line: hunk.line,
                    removed: hunk.removed,
                    added: hunk.added,
                    text: hunk.text.length > MAX_HUNK_CHARS
                        ? `${hunk.text.slice(0, MAX_HUNK_CHARS)}\n… (${hunk.text.length - MAX_HUNK_CHARS} more characters)`
                        : hunk.text,
                })),
            })),
        })),
    };
};
export const getCanvasState = (input) => {
    const ids = Object.keys(input.elements);
    const kept = ids.slice(0, CANVAS_STATE_ELEMENT_LIMIT);
    const elements = {};
    for (const id of kept) {
        const described = describeById(input, id);
        if (described !== null)
            elements[id] = described;
    }
    return {
        active: getActiveTarget(input),
        selectedElementId: input.selectedIds[0] ?? null,
        breakpoint: {
            id: input.breakpointId,
            label: input.breakpointLabel,
            width: input.canvasWidth,
        },
        elements,
        ...(ids.length > kept.length
            ? {
                truncated: {
                    returned: kept.length,
                    total: ids.length,
                    hint: `Only the first ${kept.length} of ${ids.length} elements are included. Use scamp_get_element_tree for the full structure and scamp_get_element_by_id for the rest.`,
                },
            }
            : {}),
    };
};
