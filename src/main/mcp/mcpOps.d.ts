/**
 * `<project>/.scamp/mcp.json` — how an agent discovers the running server.
 *
 * Lives under `.scamp/` for the same two reasons as `context.md`: the
 * scaffolded `.gitignore` excludes that folder, and the watcher ignores every
 * dotfile path (`watcher.ts:56`). Writing it anywhere else would make Scamp
 * see its own write as an external edit and auto-snapshot on every launch.
 * see docs/archive/2026-08-06-mcp-server-plan.md
 */
export type McpConfig = {
    url: string;
    /** Stable per project — see `ensureToken`. */
    token: string;
    running: boolean;
    started_at: string;
    project: string;
    /**
     * The folder this file was written for. A token is only reused there: a
     * project copied from someone else carries their token, which they know.
     */
    path?: string;
};
export declare const mcpConfigPath: (projectPath: string) => string;
/** Read the existing config, or null when absent/unreadable/corrupt. */
export declare const readMcpConfig: (projectPath: string) => Promise<McpConfig | null>;
/**
 * The project's token, generated once and reused forever after.
 *
 * Stability is the whole point: the token ends up in the agent's config file,
 * which is not re-read at runtime. A token that rotated per launch would
 * break every registration on every restart — the same trap the fixed port
 * avoids.
 */
export declare const ensureToken: (projectPath: string) => Promise<string>;
export declare const writeMcpConfig: (projectPath: string, config: McpConfig) => Promise<void>;
/**
 * Write a file only its owner can read: it holds the token that lets a
 * caller read the canvas. `mode` only applies to a new file, so an
 * existing one is narrowed too. (No effect on Windows, whose files
 * aren't shared through modes.)
 */
export declare const writePrivate: (path: string, content: string) => Promise<void>;
/**
 * Mark the server stopped WITHOUT deleting the file.
 *
 * Deleting would take the token with it, and a regenerated token on next
 * launch invalidates every agent config that already has this one. A
 * stale-but-flagged file is also easier to debug than a missing one.
 */
export declare const markMcpStopped: (projectPath: string) => Promise<void>;
