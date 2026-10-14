import { promises as fs } from 'fs';
import { dirname, join, sep } from 'path';

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
export const SERVER_KEY = 'scamp';

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
export const AGENT_TARGETS: ReadonlyArray<AgentTarget> = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    configPath: '.mcp.json',
    serversKey: 'mcpServers',
    entry: (url, token) => ({
      type: 'http',
      url,
      headers: { 'X-Scamp-Token': token },
    }),
    // Always written: one file, no directory, and the primary target.
    detect: [],
  },
  {
    id: 'cursor',
    label: 'Cursor',
    configPath: '.cursor/mcp.json',
    serversKey: 'mcpServers',
    entry: (url, token) => ({ url, headers: { 'X-Scamp-Token': token } }),
    detect: ['.cursor'],
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    configPath: '.gemini/settings.json',
    serversKey: 'mcpServers',
    // `httpUrl`, not `url` — see the note above.
    entry: (url, token) => ({ httpUrl: url, headers: { 'X-Scamp-Token': token } }),
    detect: ['.gemini'],
  },
  {
    id: 'kiro',
    label: 'Kiro',
    configPath: '.kiro/settings/mcp.json',
    serversKey: 'mcpServers',
    entry: (url, token) => ({ url, headers: { 'X-Scamp-Token': token } }),
    detect: ['.kiro'],
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type MergeResult =
  | { ok: true; content: string }
  | { ok: false; reason: string };

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
export const mergeServerEntry = (
  existing: string | null,
  target: AgentTarget,
  url: string,
  token: string
): MergeResult => {
  const entry = target.entry(url, token);

  if (existing === null || existing.trim().length === 0) {
    return {
      ok: true,
      content: `${JSON.stringify({ [target.serversKey]: { [SERVER_KEY]: entry } }, null, 2)}\n`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(existing);
  } catch {
    return {
      ok: false,
      reason: `${target.configPath} is not valid JSON — leaving it untouched.`,
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      reason: `${target.configPath} is not a JSON object — leaving it untouched.`,
    };
  }

  const current = parsed[target.serversKey];
  if (current !== undefined && !isRecord(current)) {
    return {
      ok: false,
      reason: `${target.configPath} has an unexpected "${target.serversKey}" value — leaving it untouched.`,
    };
  }

  const merged = {
    ...parsed,
    // Spread the existing servers first so ours replaces only its own key.
    [target.serversKey]: { ...(current ?? {}), [SERVER_KEY]: entry },
  };
  return { ok: true, content: `${JSON.stringify(merged, null, 2)}\n` };
};

/** True when any of the agent's home-relative markers exists. */
export const isAgentInstalled = async (
  target: AgentTarget,
  homeDir: string
): Promise<boolean> => {
  if (target.detect.length === 0) return true;
  for (const marker of target.detect) {
    try {
      await fs.access(join(homeDir, marker));
      return true;
    } catch {
      // Try the next marker.
    }
  }
  return false;
};

export type WriteReport = {
  written: string[];
  skipped: Array<{ path: string; reason: string }>;
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
export const ensureGitignoreEntries = async (
  projectPath: string,
  paths: ReadonlyArray<string>
): Promise<void> => {
  if (paths.length === 0) return;
  const gitignorePath = join(projectPath, '.gitignore');
  let existing = '';
  try {
    existing = await fs.readFile(gitignorePath, 'utf-8');
  } catch {
    // No .gitignore yet — create one rather than leave a token exposed.
  }
  const lines = new Set(existing.split(/\r?\n/).map((line) => line.trim()));
  const missing = paths.filter((path) => !lines.has(path));
  if (missing.length === 0) return;

  const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  const block = `${prefix}\n# Scamp MCP server registration (machine-local — do not commit)\n${missing.join('\n')}\n`;
  await fs.writeFile(gitignorePath, `${existing}${block}`, 'utf-8');
};

/**
 * Whether `path` — or the nearest part of it that exists — resolves inside
 * `root` once symlinks are followed. A project from somewhere else could
 * link `.cursor` to `~/.cursor`, and writing through it would put the
 * token in a config outside the project.
 */
const staysInside = async (root: string, path: string): Promise<boolean> => {
  const realRoot = await fs.realpath(root);
  for (let probe = path; ; probe = dirname(probe)) {
    try {
      const real = await fs.realpath(probe);
      return real === realRoot || real.startsWith(realRoot + sep);
    } catch {
      if (dirname(probe) === probe) return false;
    }
  }
};

/**
 * Write our entry into every installed agent's config.
 *
 * Best-effort per target: one unreadable or unparseable config must not stop
 * the others being written, and none of it may stop the server running.
 */
export const writeAgentConfigs = async (args: {
  projectPath: string;
  homeDir: string;
  url: string;
  token: string;
}): Promise<WriteReport> => {
  const report: WriteReport = { written: [], skipped: [] };

  for (const target of AGENT_TARGETS) {
    if (!(await isAgentInstalled(target, args.homeDir))) continue;

    const absolute = join(args.projectPath, target.configPath);
    if (!(await staysInside(args.projectPath, absolute))) {
      report.skipped.push({ path: target.configPath, reason: 'it leads outside the project through a symlink' });
      continue;
    }
    let existing: string | null = null;
    try {
      existing = await fs.readFile(absolute, 'utf-8');
    } catch {
      // Absent is the normal first-run case.
    }

    const merged = mergeServerEntry(existing, target, args.url, args.token);
    if (!merged.ok) {
      report.skipped.push({ path: target.configPath, reason: merged.reason });
      continue;
    }

    try {
      await fs.mkdir(dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, merged.content, 'utf-8');
      report.written.push(target.configPath);
    } catch (err) {
      report.skipped.push({
        path: target.configPath,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await ensureGitignoreEntries(args.projectPath, report.written).catch(() => {
    // A missing-token-in-git risk is worth logging, but never worth
    // failing project open over.
  });

  return report;
};

/** Where Claude Code records the user's answer to its `.mcp.json` prompt. */
export const CLAUDE_CODE_LOCAL_SETTINGS = '.claude/settings.local.json';

/**
 * True when a Claude Code local-settings file lists our server as
 * disabled — what it writes when the user declines (or dismisses) the
 * "use MCP servers from .mcp.json?" prompt. From then on it never tries
 * to connect, while Scamp's own indicator still says "running".
 *
 * Pure. Anything unparseable reads as "not disabled": a broken settings
 * file is not evidence of a decision.
 */
export const claudeCodeDisablesServer = (content: string | null): boolean => {
  if (content === null) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return false;
  }
  if (!isRecord(parsed)) return false;
  const disabled = parsed['disabledMcpjsonServers'];
  return Array.isArray(disabled) && disabled.includes(SERVER_KEY);
};

/**
 * Labels of installed agents whose own config refuses this project's
 * server. Read fresh on every status poll so the indicator clears the
 * moment the user resets the choice.
 */
export const detectDisabledAgents = async (
  projectPath: string
): Promise<string[]> => {
  let content: string | null = null;
  try {
    content = await fs.readFile(join(projectPath, CLAUDE_CODE_LOCAL_SETTINGS), 'utf-8');
  } catch {
    // Absent is the normal case.
  }
  return claudeCodeDisablesServer(content) ? ['Claude Code'] : [];
};
