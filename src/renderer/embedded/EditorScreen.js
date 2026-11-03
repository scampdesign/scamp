import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AppToolbar } from './AppToolbar';
import { AppView } from './AppView';
import { SidePanel } from './SidePanel';
import styles from './EditorScreen.module.css';
/** The running app beside Scamp's panel, the agent and git. */
export const EditorScreen = () => (_jsxs("div", { className: styles.screen, children: [_jsx(AppToolbar, {}), _jsxs("div", { className: styles.body, children: [_jsx(AppView, {}), _jsx(SidePanel, {})] })] }));
