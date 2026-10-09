import {
  IconFiles,
  IconComponents,
  IconPalette,
  IconHistory,
  IconSettings,
  IconSparkles,
} from '@tabler/icons-react';

import type { SidebarSection } from '@store/canvasSlice';

import { Tooltip } from '../controls/Tooltip';
import styles from './SidebarRail.module.css';

const ICON_SIZE = 20;

type Props = {
  /** The section whose panel is currently shown in the sidebar. */
  section: SidebarSection;
  /** Switch the sidebar panel to a section (Pages / Components / History). */
  onSelectSection: (section: SidebarSection) => void;
  /** Open the Design System (Theme) overlay. */
  onOpenDesignSystem: () => void;
  /** Open the project Settings overlay. */
  onOpenSettings: () => void;
  /** Highlight Design System while its overlay is open. */
  designSystemOpen: boolean;
  /** Highlight Settings while its overlay is open. */
  settingsOpen: boolean;
  /** Offer the Scamp Agent — signed-in users only. */
  agentAvailable: boolean;
};

/**
 * The project view's left icon rail (VS Code activity-bar style). Pages,
 * Components and History switch the sidebar panel; Design System and Settings
 * launch their existing overlays (rework into inline panels is a follow-up).
 * see docs/plans/icon-sidebar-nav-plan.md
 */
export const SidebarRail = ({
  section,
  onSelectSection,
  onOpenDesignSystem,
  onOpenSettings,
  designSystemOpen,
  settingsOpen,
  agentAvailable,
}: Props): JSX.Element => {
  const railButton = (
    key: string,
    label: string,
    icon: JSX.Element,
    active: boolean,
    onClick: () => void
  ): JSX.Element => (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        data-section={key}
        className={`${styles.railButton} ${active ? styles.railButtonActive : ''}`}
        onClick={onClick}
      >
        {icon}
      </button>
    </Tooltip>
  );

  // Design System and Settings are overlays that take over the workspace, so
  // while one is open the left-panel section (Pages/Components/History) icon
  // must NOT stay highlighted — the active state is exclusive.
  const sectionActive = !designSystemOpen && !settingsOpen;

  return (
    <nav className={styles.rail} aria-label="Sections" data-testid="sidebar-rail">
      {railButton(
        'pages',
        'Pages',
        <IconFiles size={ICON_SIZE} />,
        sectionActive && section === 'pages',
        () => onSelectSection('pages')
      )}
      {railButton(
        'components',
        'Components',
        <IconComponents size={ICON_SIZE} />,
        sectionActive && section === 'components',
        () => onSelectSection('components')
      )}
      {railButton(
        'design-system',
        'Design System',
        <IconPalette size={ICON_SIZE} />,
        designSystemOpen,
        onOpenDesignSystem
      )}
      {railButton(
        'history',
        'History',
        <IconHistory size={ICON_SIZE} />,
        sectionActive && section === 'history',
        () => onSelectSection('history')
      )}
      {agentAvailable &&
        railButton(
          'agent',
          'Agent',
          <IconSparkles size={ICON_SIZE} />,
          sectionActive && section === 'agent',
          () => onSelectSection('agent')
        )}
      {railButton(
        'settings',
        'Settings',
        <IconSettings size={ICON_SIZE} />,
        settingsOpen,
        onOpenSettings
      )}
    </nav>
  );
};
