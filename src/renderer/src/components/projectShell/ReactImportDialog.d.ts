import type { ProjectData } from '@shared/types';
type Props = {
    projectPath: string;
    /** This project's name, for the choice of where pages land. */
    projectName: string;
    /**
     * Open the import window on the running app — in a new project when
     * `newProject` is given, which the caller switches to first.
     */
    onReady: (url: string, appName: string, newProject?: ProjectData) => void;
    onClose: () => void;
};
/**
 * Import a React app: choose its folder and let Scamp run its dev server,
 * or give the address of one already running. Nothing runs until the
 * user has seen the exact commands and said yes.
 * see docs/plans/react-import-plan.md
 */
export declare const ReactImportDialog: ({ projectPath, projectName, onReady, onClose }: Props) => JSX.Element;
export {};
