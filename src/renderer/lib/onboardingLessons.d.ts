import type { ScampElement } from './element';
/**
 * The tutorial's lessons, and how each one knows it's done: from the
 * history entry an action records, so a lesson completes however the
 * user does it. see docs/plans/onboarding-plan.md
 */
export type LessonId = 'draw' | 'layout' | 'code' | 'component' | 'tokens' | 'agent';
/** What a lesson's check reads: the shape of a history entry. */
export type LessonSignal = {
    kind: string;
    elementIds: ReadonlyArray<string>;
    propertyKeys?: ReadonlyArray<string>;
    snapshot: Readonly<Record<string, ScampElement>>;
};
export type Lesson = {
    id: LessonId;
    title: string;
    /** What to do, as short sentences. */
    steps: ReadonlyArray<string>;
    /** Why it matters, in one sentence. */
    why: string;
    /** The user docs page that covers it. */
    docsPage: string;
    /** Offered, but not needed to finish the tutorial. */
    optional: boolean;
    /** CSS selectors for the control to point at, in order; the first one on screen is highlighted. */
    highlights: ReadonlyArray<string>;
    isDone: (signal: LessonSignal) => boolean;
};
export declare const USER_DOCS_URL = "https://github.com/scampdesign/scamp/blob/main/docs/user_docs";
export declare const LESSONS: ReadonlyArray<Lesson>;
/** The lessons a history entry completes that aren't already done, in lesson order. */
export declare const lessonsCompletedBy: (signal: LessonSignal, completed: ReadonlyArray<string>) => LessonId[];
/** The first lesson not done yet, optional ones last; null when every lesson is done. */
export declare const nextLesson: (completed: ReadonlyArray<string>) => Lesson | null;
/** Every lesson that isn't optional is done. */
export declare const isTutorialComplete: (completed: ReadonlyArray<string>) => boolean;
