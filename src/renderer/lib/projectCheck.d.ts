import type { ScampElement } from './element';
import { type ViewFinding } from './viewLint';
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
export type TargetCheck = {
    name: string;
    kind: CheckTargetKind;
    findings: ViewFinding[];
};
export type ProjectCheck = {
    /** How many pages, views, and components were checked. */
    checked: number;
    /** Only the ones with something wrong, pages first, then views, then components. */
    withFindings: TargetCheck[];
    /** Files that didn't parse, so couldn't be checked. */
    unreadable: string[];
};
export declare const checkTarget: (target: CheckTarget, themeTokens: ReadonlyArray<string>) => TargetCheck;
export declare const checkProject: (targets: ReadonlyArray<CheckTarget>, themeTokens: ReadonlyArray<string>, unreadable?: ReadonlyArray<string>) => ProjectCheck;
/**
 * The target a tool's `name` means: an exact name first, then a view's
 * route slug ("lobby" for the view Lobby), then a case-insensitive match.
 */
export declare const findCheckTarget: (targets: ReadonlyArray<CheckTarget>, name: string) => CheckTarget | null;
