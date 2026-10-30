import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { IconSchool } from '@tabler/icons-react';
import { useOnboardingStore } from '@store/onboardingSlice';
import { isTutorialComplete, nextLesson } from '@lib/onboardingLessons';
import styles from './TutorialReturn.module.css';
/** Shown under other sidebar sections while the tutorial is under way: the way back to its steps. */
export const TutorialReturn = ({ onShow }) => {
    const completed = useOnboardingStore((s) => s.completed);
    const current = nextLesson(completed);
    if (current === null || isTutorialComplete(completed))
        return null;
    return (_jsxs("button", { type: "button", className: styles.pill, onClick: onShow, "data-testid": "tutorial-return", children: [_jsx(IconSchool, { size: 16, className: styles.icon }), _jsxs("span", { className: styles.text, children: [_jsx("span", { className: styles.label, children: "Tutorial" }), _jsx("span", { className: styles.title, children: current.title })] }), _jsx("span", { className: styles.action, children: "Show steps" })] }));
};
