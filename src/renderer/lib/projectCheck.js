import { viewSlugFor } from '@shared/templates';
import { lintView } from './viewLint';
export const checkTarget = (target, themeTokens) => ({
    name: target.name,
    kind: target.kind,
    findings: lintView({ elements: target.elements, rootId: target.rootId, themeTokens }),
});
const KIND_ORDER = { page: 0, view: 1, component: 2 };
export const checkProject = (targets, themeTokens, unreadable = []) => ({
    checked: targets.length,
    withFindings: targets
        .map((target) => checkTarget(target, themeTokens))
        .filter((result) => result.findings.length > 0)
        .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name)),
    unreadable: [...unreadable],
});
/**
 * The target a tool's `name` means: an exact name first, then a view's
 * route slug ("lobby" for the view Lobby), then a case-insensitive match.
 */
export const findCheckTarget = (targets, name) => targets.find((t) => t.name === name) ??
    targets.find((t) => t.kind === 'view' && viewSlugFor(t.name) === name) ??
    targets.find((t) => t.name.toLowerCase() === name.toLowerCase()) ??
    null;
