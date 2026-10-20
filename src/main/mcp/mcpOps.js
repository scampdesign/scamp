import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { basename, dirname, join } from 'path';
export const mcpConfigPath = (projectPath) => join(projectPath, '.scamp', 'mcp.json');
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
/** Read the existing config, or null when absent/unreadable/corrupt. */
export const readMcpConfig = async (projectPath) => {
    try {
        const raw = await fs.readFile(mcpConfigPath(projectPath), 'utf-8');
        const parsed = JSON.parse(raw);
        if (!isRecord(parsed))
            return null;
        const { url, token, running, started_at, project, path } = parsed;
        if (typeof url !== 'string' || typeof token !== 'string')
            return null;
        return {
            url,
            token,
            running: running === true,
            started_at: typeof started_at === 'string' ? started_at : '',
            project: typeof project === 'string' ? project : basename(projectPath),
            ...(typeof path === 'string' ? { path } : {}),
        };
    }
    catch {
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
export const ensureToken = async (projectPath) => {
    const existing = await readMcpConfig(projectPath);
    // Only a token this folder's own file holds: one that arrived with a
    // copied project is someone else's. Agent configs are rewritten with the
    // token on every open, so a new one breaks no registration.
    if (existing !== null && existing.token.length > 0 && existing.path === projectPath)
        return existing.token;
    return randomBytes(24).toString('hex');
};
export const writeMcpConfig = async (projectPath, config) => {
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
export const writePrivate = async (path, content) => {
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
export const markMcpStopped = async (projectPath) => {
    const existing = await readMcpConfig(projectPath);
    if (existing === null)
        return;
    try {
        await writeMcpConfig(projectPath, { ...existing, running: false });
    }
    catch {
        // Best-effort: the project folder may already be gone at shutdown.
    }
};
