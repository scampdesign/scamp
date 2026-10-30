import type { OnboardingSettings } from '@shared/types';
import { type LessonId } from '@lib/onboardingLessons';
/**
 * Tutorial progress, mirrored from app settings and written back on every
 * change. see docs/plans/onboarding-plan.md
 */
export type OnboardingState = OnboardingSettings & {
    loaded: boolean;
    load: () => Promise<void>;
    complete: (ids: ReadonlyArray<LessonId>) => void;
    setHidden: (hidden: boolean) => void;
    /** The first-run offer was answered: `taken` shows the checklist. */
    answerOffer: (taken: boolean) => void;
    /** Start over: no lessons done, and the checklist showing. */
    restart: () => void;
};
export declare const useOnboardingStore: import("zustand").UseBoundStore<import("zustand").StoreApi<OnboardingState>>;
/**
 * Complete lessons from what the user does. Only an entry newer than the
 * last one read counts, so undo, redo, and switching pages, which move to
 * older entries, complete nothing. Returns the unsubscribe.
 */
export declare const watchHistoryForLessons: () => (() => void);
