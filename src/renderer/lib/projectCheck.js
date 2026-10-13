import { viewSlugFor } from '@shared/templates';
import { lintView } from './viewLint';
export const ABOUT_NOTES = 'Notes are valid CSS that renders correctly; the panel just has no control for the value, so it is edited in the CSS panel. Leave them as they are: rewriting the value to clear a note changes the layout.';
/** Each component's and view's root tag, so an instance is checked as the tag it renders. */
export const rootTagsOf = (targets) => Object.fromEntries(targets.filter((t) => t.kind !== 'page').map((t) => [t.name, t.elements[t.rootId]?.tag]));
export const checkTarget = (target, themeTokens, componentRootTags = {}) => {
    const all = lintView({ elements: target.elements, rootId: target.rootId, themeTokens, componentRootTags });
    return {
        name: target.name,
        kind: target.kind,
        findings: all.filter((f) => f.severity === 'problem'),
        notes: all.filter((f) => f.severity === 'note'),
    };
};
const KIND_ORDER = { page: 0, view: 1, component: 2 };
const byKindThenName = (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name);
export const checkProject = (targets, themeTokens, unreadable = []) => {
    const tags = rootTagsOf(targets);
    const results = targets.map((target) => checkTarget(target, themeTokens, tags));
    return {
        checked: targets.length,
        problems: results.reduce((sum, r) => sum + r.findings.length, 0),
        notes: results.reduce((sum, r) => sum + r.notes.length, 0),
        withFindings: results.filter((r) => r.findings.length > 0).sort(byKindThenName),
        withNotesOnly: results.filter((r) => r.findings.length === 0 && r.notes.length > 0).sort(byKindThenName),
        unreadable: [...unreadable],
        aboutNotes: ABOUT_NOTES,
    };
};
/**
 * The target a tool's `name` means: an exact name first, then a view's
 * route slug ("lobby" for the view Lobby), then a case-insensitive match.
 */
export const findCheckTarget = (targets, name) => targets.find((t) => t.name === name) ??
    targets.find((t) => t.kind === 'view' && viewSlugFor(t.name) === name) ??
    targets.find((t) => t.name.toLowerCase() === name.toLowerCase()) ??
    null;
