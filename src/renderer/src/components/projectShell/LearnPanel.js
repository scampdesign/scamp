import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { IconCircle, IconCircleCheck } from '@tabler/icons-react';
import { useOnboardingStore } from '@store/onboardingSlice';
import { LESSONS, USER_DOCS_URL, isTutorialComplete, nextLesson, } from '@lib/onboardingLessons';
import { AgentMarkdown } from '../agent/AgentMarkdown';
import { Button } from '../controls/Button';
import styles from './LearnPanel.module.css';
const openDocs = (page) => {
    // The main window routes window.open through shell.openExternal.
    window.open(`${USER_DOCS_URL}/${page}`, '_blank', 'noopener,noreferrer');
};
/**
 * The tutorial's checklist: each lesson, checked off as the user does it.
 * The current lesson is expanded; clicking any title opens it to read again.
 * see docs/plans/onboarding-plan.md
 */
export const LearnPanel = () => {
    const completed = useOnboardingStore((s) => s.completed);
    const setHidden = useOnboardingStore((s) => s.setHidden);
    const current = nextLesson(completed);
    const coreCount = LESSONS.filter((l) => !l.optional).length;
    const coreDone = LESSONS.filter((l) => !l.optional && completed.includes(l.id)).length;
    const finished = isTutorialComplete(completed);
    const currentId = current?.id ?? null;
    const [openId, setOpenId] = useState(currentId);
    // Finishing a lesson moves on to the next one.
    useEffect(() => setOpenId(currentId), [currentId]);
    const renderLesson = (lesson) => {
        const done = completed.includes(lesson.id);
        const open = lesson.id === openId;
        return (_jsxs("li", { className: `${styles.lesson} ${open ? styles.lessonOpen : ''}`, "data-lesson": lesson.id, "data-done": done ? 'true' : 'false', children: [_jsxs("button", { type: "button", className: styles.lessonHead, "aria-expanded": open, onClick: () => setOpenId(open ? null : lesson.id), children: [done ? (_jsx(IconCircleCheck, { size: 16, className: styles.checkDone, "aria-label": "Done" })) : (_jsx(IconCircle, { size: 16, className: styles.check, "aria-label": "Not done" })), _jsx("span", { className: styles.lessonTitle, children: lesson.title }), lesson.optional && _jsx("span", { className: styles.optional, children: "Optional" })] }), open && (_jsxs("div", { className: styles.lessonBody, children: [_jsx("ol", { className: styles.steps, children: lesson.steps.map((step) => (_jsx("li", { children: _jsx(AgentMarkdown, { text: step }) }, step))) }), _jsx("p", { className: styles.why, children: lesson.why }), _jsx("button", { type: "button", className: styles.docsLink, onClick: () => openDocs(lesson.docsPage), children: "Show me in the docs" })] }))] }, lesson.id));
    };
    return (_jsxs("div", { className: styles.panel, "data-testid": "learn-panel", children: [_jsxs("div", { className: styles.header, children: [_jsx("h2", { className: styles.title, children: "Learn Scamp" }), _jsxs("span", { className: styles.progress, "data-testid": "learn-progress", children: [coreDone, " of ", coreCount] })] }), finished && (_jsxs("div", { className: styles.finished, "data-testid": "learn-finished", children: [_jsx("p", { children: "You\u2019ve covered the basics. Next, try variants, breakpoints, or importing a page from the web." }), _jsx("button", { type: "button", className: styles.docsLink, onClick: () => openDocs('index.md'), children: "Browse the docs" })] })), _jsx("ol", { className: styles.lessons, children: LESSONS.map(renderLesson) }), _jsxs("div", { className: styles.footer, children: [_jsx(Button, { variant: "ghost", size: "sm", onClick: () => setHidden(true), children: "Hide Learn" }), _jsx("span", { className: styles.footerHint, children: "To show it again, go to Settings." })] })] }));
};
