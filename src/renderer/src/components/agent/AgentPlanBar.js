import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useAgentStore } from '@store/agentSlice';
import styles from './AgentPanel.module.css';
/**
 * Under a cleanup's plan: apply it as written, or reply to change it.
 * The agent waits for one or the other before it edits anything.
 */
export const AgentPlanBar = () => {
    const approvePlan = useAgentStore((s) => s.approvePlan);
    return (_jsxs("div", { className: styles.planBar, "data-testid": "agent-plan-bar", children: [_jsx("button", { type: "button", className: styles.primaryButton, onClick: () => void approvePlan(), children: "Apply this plan" }), _jsx("span", { className: styles.planHint, children: "Or reply to change it." })] }));
};
