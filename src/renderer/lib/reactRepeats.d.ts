import type { CapturedReact } from '@shared/importCapture';
import type { ScampElement } from './element';
export type RepeatTree = {
    elements: Record<string, ScampElement>;
    rootId: string;
    /** React's account of each element, by element id. */
    react: Readonly<Record<string, CapturedReact>>;
};
/** What a `.map()` call site's source line says: `navItems.map((item) =>`. */
export type ListSource = {
    over: string;
    as: string;
};
export type PlannedRepeat = {
    over: string;
    as: string;
    rows: number;
    fields: string[];
};
export type RepeatPlan = {
    elements: Record<string, ScampElement>;
    repeats: PlannedRepeat[];
    /** Lists left as copies because their rows look different, and in what. */
    skipped: Array<{
        list: string;
        rows: number;
        differs: string;
    }>;
};
export type RepeatOptions = {
    /** The list and row names read from each call site's source, by site. */
    sources?: Readonly<Record<string, ListSource>>;
    /** Names the root's props already use. */
    takenNames?: ReadonlyArray<string>;
};
/** `dp_nav_label` → `navLabel`; a short leading namespace (`dp`, `os`) is dropped. */
export declare const fieldNameFrom: (raw: string | undefined, fallback: string) => string;
/** The repeats in one element tree: each run of `.map()` siblings that look alike. */
export declare const planRepeats: (tree: RepeatTree, options?: RepeatOptions) => RepeatPlan;
