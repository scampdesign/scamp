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
/** `findings` are problems; `notes` are valid CSS the panel can't show in a control. */
export type TargetCheck = {
    name: string;
    kind: CheckTargetKind;
    findings: ViewFinding[];
    notes: ViewFinding[];
};
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
export declare const ABOUT_NOTES = "Notes are valid CSS that renders correctly; the panel just has no control for the value, so it is edited in the CSS panel. Leave them as they are: rewriting the value to clear a note changes the layout.";
/** Each component's and view's root tag, so an instance is checked as the tag it renders. */
export declare const rootTagsOf: (targets: ReadonlyArray<CheckTarget>) => Record<string, string | undefined>;
export declare const checkTarget: (target: CheckTarget, themeTokens: ReadonlyArray<string>, componentRootTags?: Readonly<Record<string, string | undefined>>) => TargetCheck;
export declare const checkProject: (targets: ReadonlyArray<CheckTarget>, themeTokens: ReadonlyArray<string>, unreadable?: ReadonlyArray<string>) => ProjectCheck;
/**
 * The target a tool's `name` means: an exact name first, then a view's
 * route slug ("lobby" for the view Lobby), then a case-insensitive match.
 */
export declare const findCheckTarget: (targets: ReadonlyArray<CheckTarget>, name: string) => CheckTarget | null;
