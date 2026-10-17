/**
 * What to copy to connect each agent to Scamp's MCP server: a command to
 * run, or config to paste. Every shape is from the tool's own docs,
 * checked 2026-10-17; a wrong key is silently ignored, so none is guessed.
 * Scamp also writes some of these itself (`src/main/mcp/agentConfig.ts`).
 * see docs/notes/mcp-server.md
 */
export type ConnectSnippet = {
    id: string;
    /** The tool, as the menu lists it. */
    label: string;
    /** Where the copied text goes. */
    hint: string;
    text: string;
};
export declare const connectSnippets: (url: string, token: string) => ConnectSnippet[];
