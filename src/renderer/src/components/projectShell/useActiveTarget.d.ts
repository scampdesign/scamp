import type { ProjectConfig, ProjectData } from '@shared/types';
import { type ComponentKind } from '@shared/types';
import type { ActiveComponent } from './types';
type ProjectChange = (next: ProjectData | ((prev: ProjectData) => ProjectData)) => void;
type Args = {
    project: ProjectData;
    onProjectChange?: ProjectChange;
    projectConfig: ProjectConfig;
    handleProjectConfigChange: (next: ProjectConfig) => void;
};
export type UseActiveTarget = {
    activePageName: string | null;
    setActivePageName: (name: string | null) => void;
    activeComponent: ActiveComponent | null;
    setActiveComponentState: (next: ActiveComponent | null) => void;
    parseError: {
        targetName: string;
        reason?: string;
    } | null;
    clearParseError: () => void;
    showMigrationBanner: boolean;
    handleDismissMigrationBanner: () => void;
    persistActiveSource: () => void;
    openComponent: (name: string, fromPage: string | null, kind?: ComponentKind, from?: {
        name: string;
        kind: ComponentKind;
    }) => void;
    exitComponentEditor: () => void;
    latestExit: {
        current: () => void;
    };
};
/**
 * Owns which page or component is open in the canvas and the load
 * pipeline that parses its TSX/CSS into the store. Mutually exclusive:
 * opening a component clears the active page and vice-versa. Also owns
 * the parse-error + migration banner state the load raises, the
 * source-persistence helper that mirrors the canvas's serialized output
 * back into project.* before a target swap, and the component
 * enter/exit transitions. Consumes the canvas's one-shot navigation
 * requests here since it owns `openComponent`.
 * see docs/notes/components-multi-file-ops.md
 */
export declare const useActiveTarget: ({ project, onProjectChange, projectConfig, handleProjectConfigChange, }: Args) => UseActiveTarget;
export {};
