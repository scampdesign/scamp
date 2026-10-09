import type { ProjectData } from '@shared/types';
type Props = {
    project: ProjectData;
    onClose: () => void;
    /**
     * Called after a page or component change. Accepts either a
     * replacement `ProjectData` OR a functional updater that
     * receives the latest committed state. Multi-step handlers
     * (convert-to-component, rename, etc.) MUST use the functional
     * form so sequential calls compose against React's queued
     * state instead of stomping each other via stale closure refs.
     */
    onProjectChange?: (next: ProjectData | ((prev: ProjectData) => ProjectData)) => void;
    /**
     * Close this project and open another, then open the import window on
     * a React app there — a React import into a new project.
     */
    onSwitchProject?: (next: ProjectData, thenImport: PendingReactImport) => void;
    /** A React import to open as soon as this project is up. */
    pendingImport?: PendingReactImport | null;
    onPendingImportHandled?: () => void;
};
/** A React app running at `url`, waiting for its import window. */
export type PendingReactImport = {
    url: string;
    appName: string;
    tokens: boolean;
};
export declare const ProjectShell: ({ project, onClose, onProjectChange, onSwitchProject, pendingImport, onPendingImportHandled, }: Props) => JSX.Element;
export {};
