import { viewSlugFor } from '@shared/templates';

import type { ScampElement } from './element';
import { lintView, type ViewFinding } from './viewLint';

/**
 * The checks behind `scamp_check_view` and `scamp_check_project`, over
 * every page, view, and component — not only the one on the canvas.
 * see docs/notes/view-lint.md
 */

export type CheckTargetKind = 'page' | 'view' | 'component';

export type CheckTarget = {
  name: string;
  kind: CheckTargetKind;
  elements: Record<string, ScampElement>;
  rootId: string;
};

export type TargetCheck = { name: string; kind: CheckTargetKind; findings: ViewFinding[] };

export type ProjectCheck = {
  /** How many pages, views, and components were checked. */
  checked: number;
  /** Only the ones with something wrong, pages first, then views, then components. */
  withFindings: TargetCheck[];
  /** Files that didn't parse, so couldn't be checked. */
  unreadable: string[];
};

export const checkTarget = (target: CheckTarget, themeTokens: ReadonlyArray<string>): TargetCheck => ({
  name: target.name,
  kind: target.kind,
  findings: lintView({ elements: target.elements, rootId: target.rootId, themeTokens }),
});

const KIND_ORDER: Record<CheckTargetKind, number> = { page: 0, view: 1, component: 2 };

export const checkProject = (
  targets: ReadonlyArray<CheckTarget>,
  themeTokens: ReadonlyArray<string>,
  unreadable: ReadonlyArray<string> = []
): ProjectCheck => ({
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
export const findCheckTarget = (targets: ReadonlyArray<CheckTarget>, name: string): CheckTarget | null =>
  targets.find((t) => t.name === name) ??
  targets.find((t) => t.kind === 'view' && viewSlugFor(t.name) === name) ??
  targets.find((t) => t.name.toLowerCase() === name.toLowerCase()) ??
  null;
