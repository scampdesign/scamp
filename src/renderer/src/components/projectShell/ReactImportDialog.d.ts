type Props = {
    projectPath: string;
    /** Open the import window on the running app. */
    onReady: (url: string, appName: string) => void;
    onClose: () => void;
};
/**
 * Import a React app: choose its folder and let Scamp run its dev server,
 * or give the address of one already running. Nothing runs until the
 * user has seen the exact commands and said yes.
 * see docs/plans/react-import-plan.md
 */
export declare const ReactImportDialog: ({ projectPath, onReady, onClose }: Props) => JSX.Element;
export {};
