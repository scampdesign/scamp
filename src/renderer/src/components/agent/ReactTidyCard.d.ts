type Props = {
    viewName: string;
    appName: string;
};
/**
 * "Tidy up with AI", for a view imported from a React app: the agent reads
 * the app's source for what one render couldn't show — when things appear,
 * and what the app calls its lists — and shows a plan first.
 * see docs/plans/react-import-plan.md, Phase 6
 */
export declare const ReactTidyCard: ({ viewName, appName }: Props) => JSX.Element;
export {};
