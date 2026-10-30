import { useEffect, useState } from 'react';
import { IconCircle, IconCircleCheck } from '@tabler/icons-react';

import { useOnboardingStore } from '@store/onboardingSlice';
import {
  LESSONS,
  USER_DOCS_URL,
  isTutorialComplete,
  nextLesson,
  type Lesson,
  type LessonId,
} from '@lib/onboardingLessons';

import { AgentMarkdown } from '../agent/AgentMarkdown';
import { Button } from '../controls/Button';
import styles from './LearnPanel.module.css';

const openDocs = (page: string): void => {
  // The main window routes window.open through shell.openExternal.
  window.open(`${USER_DOCS_URL}/${page}`, '_blank', 'noopener,noreferrer');
};

/**
 * The tutorial's checklist: each lesson, checked off as the user does it.
 * The current lesson is expanded; clicking any title opens it to read again.
 * see docs/plans/onboarding-plan.md
 */
export const LearnPanel = (): JSX.Element => {
  const completed = useOnboardingStore((s) => s.completed);
  const setHidden = useOnboardingStore((s) => s.setHidden);
  const current = nextLesson(completed);
  const coreCount = LESSONS.filter((l) => !l.optional).length;
  const coreDone = LESSONS.filter((l) => !l.optional && completed.includes(l.id)).length;
  const finished = isTutorialComplete(completed);
  const currentId = current?.id ?? null;
  const [openId, setOpenId] = useState<LessonId | null>(currentId);
  // Finishing a lesson moves on to the next one.
  useEffect(() => setOpenId(currentId), [currentId]);

  const renderLesson = (lesson: Lesson): JSX.Element => {
    const done = completed.includes(lesson.id);
    const open = lesson.id === openId;
    return (
      <li
        key={lesson.id}
        className={`${styles.lesson} ${open ? styles.lessonOpen : ''}`}
        data-lesson={lesson.id}
        data-done={done ? 'true' : 'false'}
      >
        <button
          type="button"
          className={styles.lessonHead}
          aria-expanded={open}
          onClick={() => setOpenId(open ? null : lesson.id)}
        >
          {done ? (
            <IconCircleCheck size={16} className={styles.checkDone} aria-label="Done" />
          ) : (
            <IconCircle size={16} className={styles.check} aria-label="Not done" />
          )}
          <span className={styles.lessonTitle}>{lesson.title}</span>
          {lesson.optional && <span className={styles.optional}>Optional</span>}
        </button>
        {open && (
          <div className={styles.lessonBody}>
            <ol className={styles.steps}>
              {lesson.steps.map((step) => (
                <li key={step}>
                  <AgentMarkdown text={step} />
                </li>
              ))}
            </ol>
            <p className={styles.why}>{lesson.why}</p>
            <button type="button" className={styles.docsLink} onClick={() => openDocs(lesson.docsPage)}>
              Show me in the docs
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className={styles.panel} data-testid="learn-panel">
      <div className={styles.header}>
        <h2 className={styles.title}>Learn Scamp</h2>
        <span className={styles.progress} data-testid="learn-progress">
          {coreDone} of {coreCount}
        </span>
      </div>
      {finished && (
        <div className={styles.finished} data-testid="learn-finished">
          <p>
            You’ve covered the basics. Next, try variants, breakpoints, or importing a page from the web.
          </p>
          <button type="button" className={styles.docsLink} onClick={() => openDocs('index.md')}>
            Browse the docs
          </button>
        </div>
      )}
      <ol className={styles.lessons}>{LESSONS.map(renderLesson)}</ol>
      <div className={styles.footer}>
        <Button variant="ghost" size="sm" onClick={() => setHidden(true)}>
          Hide Learn
        </Button>
        <span className={styles.footerHint}>To show it again, go to Settings.</span>
      </div>
    </div>
  );
};
