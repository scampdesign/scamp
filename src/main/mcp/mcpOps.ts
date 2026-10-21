import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { basename, dirname, join } from 'path';

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

export const mcpConfigPath = (projectPath: string): string =>
  join(projectPath, '.scamp', 'mcp.json');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Read the existing config, or null when absent/unreadable/corrupt. */
export const readMcpConfig = async (
  projectPath: string
): Promise<McpConfig | null> => {
  try {
    const raw = await fs.readFile(mcpConfigPath(projectPath), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const { url, token, running, started_at, project, path } = parsed;
    if (typeof url !== 'string' || typeof token !== 'string') return null;
    return {
      url,
      token,
      running: running === true,
      started_at: typeof started_at === 'string' ? started_at : '',
      project: typeof project === 'string' ? project : basename(projectPath),
      ...(typeof path === 'string' ? { path } : {}),
    };
  } catch {
    return null;
  }
};

/**
 * The project's token, generated once and reused forever after.
 *
 * Stability is the whole point: the token ends up in the agent's config file,
 * which is not re-read at runtime. A token that rotated per launch would
 * break every registration on every restart — the same trap the fixed port
 * avoids.
 */
export const ensureToken = async (projectPath: string): Promise<string> => {
  const existing = await readMcpConfig(projectPath);
  // Only a token this folder's own file holds: one that arrived with a
  // copied project is someone else's. Agent configs are rewritten with the
  // token on every open, so a new one breaks no registration.
  if (existing !== null && existing.token.length > 0 && existing.path === projectPath) return existing.token;
  return randomBytes(24).toString('hex');
};

export const writeMcpConfig = async (
  projectPath: string,
  config: McpConfig
): Promise<void> => {
  const path = mcpConfigPath(projectPath);
  await fs.mkdir(dirname(path), { recursive: true });
  await writePrivate(path, `${JSON.stringify({ ...config, path: projectPath }, null, 2)}\n`);
};

/**
 * Write a file only its owner can read: it holds the token that lets a
 * caller read the canvas. `mode` only applies to a new file, so an
 * existing one is narrowed too. (No effect on Windows, whose files
 * aren't shared through modes.)
 */
export const writePrivate = async (path: string, content: string): Promise<void> => {
  await fs.writeFile(path, content, { encoding: 'utf-8', mode: 0o600 });
  await fs.chmod(path, 0o600).catch(() => undefined);
};

/**
 * Mark the server stopped WITHOUT deleting the file.
 *
 * Deleting would take the token with it, and a regenerated token on next
 * launch invalidates every agent config that already has this one. A
 * stale-but-flagged file is also easier to debug than a missing one.
 */
export const markMcpStopped = async (projectPath: string): Promise<void> => {
  const existing = await readMcpConfig(projectPath);
  if (existing === null) return;
  try {
    await writeMcpConfig(projectPath, { ...existing, running: false });
  } catch {
    // Best-effort: the project folder may already be gone at shutdown.
  }
};
