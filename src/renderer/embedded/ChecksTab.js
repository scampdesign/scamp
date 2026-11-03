import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AgentMarkdown } from '../src/components/agent/AgentMarkdown';
import { useEmbeddedStore } from './embeddedStore';
import styles from './ChecksTab.module.css';
/** A read of the whole project: tokens, accessibility, scales and duplicated styles. */
export const ChecksTab = () => {
    const report = useEmbeddedStore((s) => s.report);
    const checking = useEmbeddedStore((s) => s.checking);
    const set = useEmbeddedStore((s) => s.set);
    const handleRun = async () => {
        set({ checking: true, report: null });
        await window.scampEmbedded.designCheck();
    };
    return (_jsxs("div", { className: styles.tab, children: [_jsx("p", { className: styles.lede, children: "The agent reads the whole project and reports one-off values, accessibility problems, values off the project\u2019s scale, and duplicated styles. It doesn\u2019t change any files." }), _jsx("button", { type: "button", className: styles.run, onClick: () => void handleRun(), disabled: checking, "data-testid": "embedded-design-check", children: checking ? 'Checking…' : 'Run design check' }), report !== null && (_jsx("div", { className: styles.report, "data-testid": "embedded-report", children: _jsx(AgentMarkdown, { text: report }) }))] }));
};
