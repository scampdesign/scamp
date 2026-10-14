/**
 * Registers the running MCP server in each installed agent's own config, so
 * the user connects by doing nothing.
 *
 * The alternative was a command to copy-paste, which most people never run —
 * a feature nobody connects to has shipped in name only. `claude mcp add
 * --scope project` turned out to just write a plain `.mcp.json`, so we write
 * it ourselves, and the same trick generalises to the other agents.
 *
 * ⚠️ This is the only code in the MCP feature that writes OUTSIDE `.scamp/`.
 * Every write merges into whatever the user already had — clobbering someone's
 * editor or agent config is the one bug here that damages something Scamp
 * doesn't own. see docs/archive/2026-08-06-mcp-server-plan.md
 */
/** The key we own inside each agent's server map. */
export declare const SERVER_KEY = "scamp";
export type AgentTarget = {
    id: string;
    label: string;
    /** Project-relative, POSIX. Every one is a dotfile path, so the watcher
     *  ignores it (`watcher.ts:56`) and Scamp won't see its own write. */
    configPath: string;
    /** Top-level key holding the server map. Not uniform across agents. */
    serversKey: string;
    /** Renders our entry. Not uniform either — see the Gemini note below. */
    entry: (url: string, token: string) => Record<string, unknown>;
    /** Home-relative paths that indicate this agent is installed. Empty =
     *  always write. */
    detect: ReadonlyArray<string>;
};
/**
 * The agents we can configure, with every shape verified rather than assumed.
 *
 * The Gemini row is why "verify each one" is not pedantry: it takes
 * `httpUrl`, NOT `url` — `url` there means an SSE endpoint. Writing `url`
 * would have registered a streamable-HTTP server as SSE and failed at
 * connect time, silently, only for Gemini users.
 *
 * Deliberately absent, pending verification:
 *   - VS Code (`.vscode/mcp.json`, `servers` key) — the docs I could reach
 *     describe the extension-provider API, which uses `uri`, not the user
 *     `mcp.json` format. Guessing produces a file that is silently ignored.
 *     `.vscode/mcp.json` also permits comments, which our merge cannot
 *     preserve — another reason to hold.
 *   - Codex (`~/.codex/config.toml`) — TOML, and project-level support is
 *     unconfirmed. A TOML *writer* that preserves a user's existing file is
 *     a different job from a JSON merge.
 * Both are additive later; the copy button (Phase 6) covers them meanwhile.
 */
export declare const AGENT_TARGETS: ReadonlyArray<AgentTarget>;
export type MergeResult = {
    ok: true;
    content: string;
} | {
    ok: false;
    reason: string;
};
/**
 * Splice our entry into an existing config, preserving everything else.
 *
 * Pure, so the case that matters — "the user already had servers here" — is
 * testable without a filesystem.
 *
 * Refuses rather than overwrites when the existing file doesn't parse or has
 * a server map of the wrong type. A user with hand-written JSONC, or a
 * half-saved file, must not lose it because Scamp wanted to add a key.
 */
export declare const mergeServerEntry: (existing: string | null, target: AgentTarget, url: string, token: string) => MergeResult;
/** True when any of the agent's home-relative markers exists. */
export declare const isAgentInstalled: (target: AgentTarget, homeDir: string) => Promise<boolean>;
export type WriteReport = {
    written: string[];
    skipped: Array<{
        path: string;
        reason: string;
    }>;
};
/**
 * Append paths to `.gitignore` that aren't already covered.
 *
 * These files hold a localhost URL and a token: committing one leaks the
 * token and hands teammates a dead URL. `.mcp.json` is *conventionally*
 * committed (it's how teams share MCP config), so this actively cuts against
 * the norm — deliberately, because ours is machine-local.
 *
 * Matching is line-exact rather than gitignore-semantic: a pattern like
 * `.cursor/` already covers `.cursor/mcp.json`, but re-listing the file is
 * harmless while parsing gitignore semantics properly is not worth it here.
 */
export declare const ensureGitignoreEntries: (projectPath: string, paths: ReadonlyArray<string>) => Promise<void>;
/**
 * Write our entry into every installed agent's config.
 *
 * Best-effort per target: one unreadable or unparseable config must not stop
 * the others being written, and none of it may stop the server running.
 */
export declare const writeAgentConfigs: (args: {
    projectPath: string;
    homeDir: string;
    url: string;
    token: string;
}) => Promise<WriteReport>;
/** Where Claude Code records the user's answer to its `.mcp.json` prompt. */
export declare const CLAUDE_CODE_LOCAL_SETTINGS = ".claude/settings.local.json";
/**
 * True when a Claude Code local-settings file lists our server as
 * disabled — what it writes when the user declines (or dismisses) the
 * "use MCP servers from .mcp.json?" prompt. From then on it never tries
 * to connect, while Scamp's own indicator still says "running".
 *
 * Pure. Anything unparseable reads as "not disabled": a broken settings
 * file is not evidence of a decision.
 */
export declare const claudeCodeDisablesServer: (content: string | null) => boolean;
/**
 * Labels of installed agents whose own config refuses this project's
 * server. Read fresh on every status poll so the indicator clears the
 * moment the user resets the choice.
 */
export declare const detectDisabledAgents: (projectPath: string) => Promise<string[]>;
