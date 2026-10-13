/**
 * `scamp_check_view` and `scamp_check_project`, for the MCP server and the
 * Scamp Agent. They read every page, view, and component from disk when
 * asked — not a cached copy, which an outside edit could leave behind —
 * and the open one as the canvas shows it, unsaved edits included.
 * see docs/notes/view-lint.md
 */
type CheckAnswer = {
    ok: boolean;
    text: string;
    summary?: string;
};
export declare const answerCheck: (projectPath: string, tool: "scamp_check_view" | "scamp_check_project", input: Record<string, unknown>) => Promise<CheckAnswer>;
export {};
