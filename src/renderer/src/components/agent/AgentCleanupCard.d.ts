type Props = {
    projectPath: string;
    viewName: string;
};
/**
 * "Clean up this import", for the view imported most recently. The token
 * question comes first, because it decides what the cleanup may touch:
 * theme.css, or nothing outside the page.
 * see docs/archive/2026-10-06-builtin-agent-plan.md
 */
export declare const AgentCleanupCard: ({ projectPath, viewName }: Props) => JSX.Element;
export {};
