import type { SidebarSection } from '@store/canvasSlice';
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
 * see docs/archive/2026-07-20-icon-sidebar-nav-plan.md
 */
export declare const SidebarRail: ({ section, onSelectSection, onOpenDesignSystem, onOpenSettings, designSystemOpen, settingsOpen, agentAvailable, }: Props) => JSX.Element;
export {};
