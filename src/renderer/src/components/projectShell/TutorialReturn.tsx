import { IconSchool } from '@tabler/icons-react';

import { useOnboardingStore } from '@store/onboardingSlice';
import { isTutorialComplete, nextLesson } from '@lib/onboardingLessons';

import styles from './TutorialReturn.module.css';

type Props = {
  onShow: () => void;
};

/** Shown under other sidebar sections while the tutorial is under way: the way back to its steps. */
export const TutorialReturn = ({ onShow }: Props): JSX.Element | null => {
  const completed = useOnboardingStore((s) => s.completed);
  const current = nextLesson(completed);
  if (current === null || isTutorialComplete(completed)) return null;
  return (
    <button type="button" className={styles.pill} onClick={onShow} data-testid="tutorial-return">
      <IconSchool size={16} className={styles.icon} />
      <span className={styles.text}>
        <span className={styles.label}>Tutorial</span>
        <span className={styles.title}>{current.title}</span>
      </span>
      <span className={styles.action}>Show steps</span>
    </button>
  );
};
