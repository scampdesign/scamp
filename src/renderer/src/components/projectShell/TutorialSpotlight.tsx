import { useEffect, useState } from 'react';

import { useOnboardingStore } from '@store/onboardingSlice';
import { nextLesson } from '@lib/onboardingLessons';

import styles from './TutorialSpotlight.module.css';

type Box = { top: number; left: number; width: number; height: number };

const PAD = 4;
const POLL_MS = 250;

/** The first selector with a visible match, as a padded box in viewport space. */
const findTarget = (selectors: ReadonlyArray<string>): Box | null => {
  for (const selector of selectors) {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    if (rect !== undefined && rect.width > 0 && rect.height > 0) {
      return { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };
    }
  }
  return null;
};

const sameBox = (a: Box | null, b: Box | null): boolean =>
  a === b ||
  (a !== null && b !== null && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

/**
 * A pulsing ring around the control the current lesson asks the user to
 * click. Polls, because the target comes and goes with selection, panels,
 * and popovers that the tutorial doesn't own. see docs/plans/onboarding-plan.md
 */
export const TutorialSpotlight = (): JSX.Element | null => {
  const hidden = useOnboardingStore((s) => s.hidden);
  const completed = useOnboardingStore((s) => s.completed);
  const highlights = hidden ? null : (nextLesson(completed)?.highlights ?? null);
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    if (highlights === null || highlights.length === 0) {
      setBox(null);
      return;
    }
    const tick = (): void => {
      const next = findTarget(highlights);
      setBox((prev) => (sameBox(prev, next) ? prev : next));
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, [highlights]);

  if (box === null) return null;
  return <div className={styles.spotlight} style={box} aria-hidden="true" data-testid="tutorial-spotlight" />;
};
