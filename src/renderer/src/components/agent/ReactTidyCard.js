import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useAgentStore } from '@store/agentSlice';
import styles from './AgentPanel.module.css';
/**
 * "Tidy up with AI", for a view imported from a React app: the agent reads
 * the app's source for what one render couldn't show — when things appear,
 * and what the app calls its lists — and shows a plan first.
 * see docs/plans/react-import-plan.md, Phase 6
 */
export const ReactTidyCard = ({ viewName, appName }) => {
    const startReactTidy = useAgentStore((s) => s.startReactTidy);
    return (_jsxs("div", { className: styles.cleanupCard, "data-testid": "agent-react-tidy-card", children: [_jsxs("p", { className: styles.cleanupTitle, children: ["Tidy up ", viewName] }), _jsxs("p", { className: styles.emptyText, children: ["The agent reads ", appName, "\u2019s source for what the import couldn\u2019t see: which parts of this page show only sometimes, and what the app calls its lists. It doesn\u2019t change how the page looks, and it shows you a plan first."] }), _jsxs("button", { type: "button", className: styles.cleanupChoice, onClick: () => void startReactTidy(viewName), children: [_jsx("span", { className: styles.cleanupChoiceLabel, children: "Tidy up with AI" }), _jsx("span", { className: styles.cleanupChoiceHint, children: "Show conditions and list names, from the source." })] })] }));
};
