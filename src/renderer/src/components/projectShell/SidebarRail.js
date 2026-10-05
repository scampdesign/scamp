import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { IconFiles, IconComponents, IconPalette, IconHistory, IconSettings, IconSparkles, } from '@tabler/icons-react';
import { Tooltip } from '../controls/Tooltip';
import styles from './SidebarRail.module.css';
const ICON_SIZE = 20;
/**
 * The project view's left icon rail (VS Code activity-bar style). Pages,
 * Components and History switch the sidebar panel; Design System and Settings
 * launch their existing overlays (rework into inline panels is a follow-up).
 * see docs/plans/icon-sidebar-nav-plan.md
 */
export const SidebarRail = ({ section, onSelectSection, onOpenDesignSystem, onOpenSettings, designSystemOpen, settingsOpen, agentAvailable, }) => {
    const railButton = (key, label, icon, active, onClick) => (_jsx(Tooltip, { label: label, children: _jsx("button", { type: "button", "aria-label": label, "aria-pressed": active, "data-section": key, className: `${styles.railButton} ${active ? styles.railButtonActive : ''}`, onClick: onClick, children: icon }) }));
    // Design System and Settings are overlays that take over the workspace, so
    // while one is open the left-panel section (Pages/Components/History) icon
    // must NOT stay highlighted — the active state is exclusive.
    const sectionActive = !designSystemOpen && !settingsOpen;
    return (_jsxs("nav", { className: styles.rail, "aria-label": "Sections", "data-testid": "sidebar-rail", children: [railButton('pages', 'Pages', _jsx(IconFiles, { size: ICON_SIZE }), sectionActive && section === 'pages', () => onSelectSection('pages')), railButton('components', 'Components', _jsx(IconComponents, { size: ICON_SIZE }), sectionActive && section === 'components', () => onSelectSection('components')), railButton('design-system', 'Design System', _jsx(IconPalette, { size: ICON_SIZE }), designSystemOpen, onOpenDesignSystem), railButton('history', 'History', _jsx(IconHistory, { size: ICON_SIZE }), sectionActive && section === 'history', () => onSelectSection('history')), agentAvailable &&
                railButton('agent', 'Agent', _jsx(IconSparkles, { size: ICON_SIZE }), sectionActive && section === 'agent', () => onSelectSection('agent')), railButton('settings', 'Settings', _jsx(IconSettings, { size: ICON_SIZE }), settingsOpen, onOpenSettings)] }));
};
