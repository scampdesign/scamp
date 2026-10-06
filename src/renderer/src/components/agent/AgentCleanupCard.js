import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rememberedTokenMode, useAgentStore } from '@store/agentSlice';
import styles from './AgentPanel.module.css';
/**
 * "Clean up this import", for the view imported most recently. The token
 * question comes first, because it decides what the cleanup may touch:
 * theme.css, or nothing outside the page.
 * see docs/plans/builtin-agent-plan.md
 */
export const AgentCleanupCard = ({ projectPath, viewName }) => {
    const startCleanup = useAgentStore((s) => s.startCleanup);
    const remembered = rememberedTokenMode(projectPath);
    const choice = (mode, label, hint) => (_jsxs("button", { type: "button", className: `${styles.cleanupChoice} ${remembered === mode ? styles.cleanupChoiceLast : ''}`, onClick: () => void startCleanup(mode), children: [_jsx("span", { className: styles.cleanupChoiceLabel, children: label }), _jsx("span", { className: styles.cleanupChoiceHint, children: hint })] }));
    return (_jsxs("div", { className: styles.cleanupCard, "data-testid": "agent-cleanup-card", children: [_jsxs("p", { className: styles.cleanupTitle, children: ["Clean up ", viewName] }), _jsx("p", { className: styles.emptyText, children: "The agent makes the page you just imported easier to edit, without changing how it looks. It shows you a plan before changing anything. What should it do with repeated colors and sizes?" }), choice('create-tokens', 'Create theme tokens', 'Name repeated values and use them through theme.css.'), choice('keep-literal', 'Keep hex values', 'Leave values as the page wrote them. theme.css is not touched.')] }));
};
