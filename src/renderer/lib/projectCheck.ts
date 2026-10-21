import { viewSlugFor } from '@shared/templates';

import type { ScampElement } from './element';
import { lintView, type ComponentRoot, type ViewFinding } from './viewLint';

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

/** `findings` are problems; `notes` are valid CSS the panel can't show in a control. */
export type TargetCheck = { name: string; kind: CheckTargetKind; findings: ViewFinding[]; notes: ViewFinding[] };

export type ProjectCheck = {
  /** How many pages, views, and components were checked. */
  checked: number;
  problems: number;
  notes: number;
  /** Ones with problems (their notes too), pages first, then views, then components. */
  withFindings: TargetCheck[];
  /** Ones with only notes. */
  withNotesOnly: TargetCheck[];
  /** Files that didn't parse, so couldn't be checked. */
  unreadable: string[];
  /** What notes are, said where an agent reads them. */
  aboutNotes: string;
};

export const ABOUT_NOTES =
  'Notes are valid CSS that renders correctly; the panel just has no control for the value, so it is edited in the CSS panel. Leave them as they are: rewriting the value to clear a note changes the layout.';

/** Each component's and view's root, so an instance is checked as what it renders. */
export const componentRootsOf = (targets: ReadonlyArray<CheckTarget>): Record<string, ComponentRoot | undefined> =>
  Object.fromEntries(
    targets.filter((t) => t.kind !== 'page').map((t) => [t.name, t.elements[t.rootId]])
  );

export const checkTarget = (
  target: CheckTarget,
  themeTokens: ReadonlyArray<string>,
  componentRoots: Readonly<Record<string, ComponentRoot | undefined>> = {}
): TargetCheck => {
  const all = lintView({ elements: target.elements, rootId: target.rootId, themeTokens, componentRoots });
  return {
    name: target.name,
    kind: target.kind,
    findings: all.filter((f) => f.severity === 'problem'),
    notes: all.filter((f) => f.severity === 'note'),
  };
};

const KIND_ORDER: Record<CheckTargetKind, number> = { page: 0, view: 1, component: 2 };

const byKindThenName = (a: TargetCheck, b: TargetCheck): number =>
  KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name);

export const checkProject = (
  targets: ReadonlyArray<CheckTarget>,
  themeTokens: ReadonlyArray<string>,
  unreadable: ReadonlyArray<string> = []
): ProjectCheck => {
  const roots = componentRootsOf(targets);
  const results = targets.map((target) => checkTarget(target, themeTokens, roots));
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
export const findCheckTarget = (targets: ReadonlyArray<CheckTarget>, name: string): CheckTarget | null =>
  targets.find((t) => t.name === name) ??
  targets.find((t) => t.kind === 'view' && viewSlugFor(t.name) === name) ??
  targets.find((t) => t.name.toLowerCase() === name.toLowerCase()) ??
  null;
