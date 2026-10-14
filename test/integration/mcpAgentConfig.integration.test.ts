import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AGENT_TARGETS,
  ensureGitignoreEntries,
  isAgentInstalled,
  mergeServerEntry,
  SERVER_KEY,
  writeAgentConfigs,
  type MergeResult,
} from '../../src/main/mcp/agentConfig';

/**
 * Auto-registration. This is the only MCP code that writes OUTSIDE `.scamp/`,
 * so the tests are weighted towards what happens to files the user already
 * owned: nothing may be lost, and anything we can't safely merge must be left
 * exactly as it was.
 * see docs/archive/2026-08-06-mcp-server-plan.md
 */

const URL = 'http://127.0.0.1:39841/mcp';
const TOKEN = 'tok-123';

const claude = AGENT_TARGETS.find((t) => t.id === 'claude-code')!;
const cursor = AGENT_TARGETS.find((t) => t.id === 'cursor')!;
const gemini = AGENT_TARGETS.find((t) => t.id === 'gemini-cli')!;

type ServerMap = Record<string, Record<string, unknown>>;
type ParsedConfig = { mcpServers?: ServerMap } & Record<string, unknown>;

/** The merged file's text. Throws loudly if the merge actually failed, so a
 *  broken expectation can't masquerade as a passing assertion. */
const content = (result: MergeResult): string => {
  if (!result.ok) throw new Error(`expected a successful merge: ${result.reason}`);
  return result.content;
};

const parse = (result: MergeResult): ParsedConfig =>
  JSON.parse(content(result)) as ParsedConfig;

const servers = (config: ParsedConfig): ServerMap => {
  const map = config.mcpServers;
  if (map === undefined) throw new Error('config has no mcpServers');
  return map;
};

const scampEntry = (config: ParsedConfig): Record<string, unknown> => {
  const entry = servers(config)[SERVER_KEY];
  if (entry === undefined) throw new Error('config has no scamp entry');
  return entry;
};

describe('the target table', () => {
  it('registers Claude Code unconditionally', () => {
    // One file, no directory, and the primary target.
    expect(claude.detect).toEqual([]);
    expect(claude.configPath).toBe('.mcp.json');
  });

  it('writes every config to a dotfile path the watcher ignores', () => {
    // A non-dotfile path would make Scamp see its own write as an external
    // edit and auto-snapshot on every launch.
    for (const target of AGENT_TARGETS) {
      expect(target.configPath.startsWith('.')).toBe(true);
    }
  });

  it('uses httpUrl for Gemini, not url', () => {
    // `url` in Gemini means an SSE endpoint. Writing it would register a
    // streamable-HTTP server as SSE and fail at connect time, silently and
    // only for Gemini users.
    const entry = gemini.entry(URL, TOKEN);
    expect(entry['httpUrl']).toBe(URL);
    expect(entry['url']).toBeUndefined();
  });

  it('uses url for Claude Code and Cursor', () => {
    expect(claude.entry(URL, TOKEN)['url']).toBe(URL);
    expect(cursor.entry(URL, TOKEN)['url']).toBe(URL);
  });

  it('sends the token as a header on every target', () => {
    for (const target of AGENT_TARGETS) {
      expect(target.entry(URL, TOKEN)['headers']).toEqual({
        'X-Scamp-Token': TOKEN,
      });
    }
  });

  it('omits the agents whose formats are unverified', () => {
    // VS Code (`servers` key, uri-vs-url unresolved) and Codex (TOML) are
    // held deliberately — a guessed format writes a silently ignored file.
    const ids = AGENT_TARGETS.map((t) => t.id);
    expect(ids).not.toContain('vscode');
    expect(ids).not.toContain('codex');
  });
});

describe('mergeServerEntry — creating', () => {
  it('creates a config when none exists', () => {
    const out = mergeServerEntry(null, claude, URL, TOKEN);
    expect(out.ok).toBe(true);
    expect(parse(out)).toEqual({
      mcpServers: { scamp: { type: 'http', url: URL, headers: { 'X-Scamp-Token': TOKEN } } },
    });
  });

  it('treats an empty file as absent', () => {
    const out = mergeServerEntry('   \n', claude, URL, TOKEN);
    expect(out.ok).toBe(true);
    expect(scampEntry(parse(out))).toBeDefined();
  });

  it('ends the file with a newline', () => {
    expect(content(mergeServerEntry(null, claude, URL, TOKEN)).endsWith('\n')).toBe(
      true
    );
  });
});

describe('mergeServerEntry — preserving what the user had', () => {
  it('keeps other MCP servers untouched', () => {
    const existing = JSON.stringify({
      mcpServers: {
        github: { type: 'http', url: 'https://api.githubcopilot.com/mcp/' },
      },
    });
    const merged = parse(mergeServerEntry(existing, claude, URL, TOKEN));
    expect(servers(merged)['github']).toEqual({
      type: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
    });
    expect(scampEntry(merged)).toBeDefined();
  });

  it('keeps unrelated top-level keys', () => {
    // `.gemini/settings.json` in particular holds far more than MCP config.
    const existing = JSON.stringify({
      theme: 'dark',
      selectedAuthType: 'oauth',
      mcpServers: {},
    });
    const merged = parse(mergeServerEntry(existing, gemini, URL, TOKEN));
    expect(merged['theme']).toBe('dark');
    expect(merged['selectedAuthType']).toBe('oauth');
  });

  it('creates the server map when the file exists without one', () => {
    const merged = parse(
      mergeServerEntry(JSON.stringify({ theme: 'dark' }), gemini, URL, TOKEN)
    );
    expect(merged['theme']).toBe('dark');
    expect(scampEntry(merged)).toBeDefined();
  });

  it('updates our own entry in place instead of duplicating it', () => {
    const first = content(mergeServerEntry(null, claude, URL, TOKEN));
    const second = parse(
      mergeServerEntry(first, claude, 'http://127.0.0.1:39850/mcp', 'tok-2')
    );
    expect(Object.keys(servers(second))).toEqual([SERVER_KEY]);
    expect(scampEntry(second)['url']).toBe('http://127.0.0.1:39850/mcp');
    expect(scampEntry(second)['headers']).toEqual({ 'X-Scamp-Token': 'tok-2' });
  });

  it('is idempotent', () => {
    const once = content(mergeServerEntry(null, claude, URL, TOKEN));
    expect(content(mergeServerEntry(once, claude, URL, TOKEN))).toBe(once);
  });
});

describe('mergeServerEntry — refusing rather than clobbering', () => {
  it('refuses to overwrite malformed JSON', () => {
    // A half-saved file or hand-written JSONC must survive contact with us.
    const out = mergeServerEntry('{ this is not json', claude, URL, TOKEN);
    expect(out.ok).toBe(false);
  });

  it('refuses when the file is a JSON array', () => {
    expect(mergeServerEntry('[]', claude, URL, TOKEN).ok).toBe(false);
  });

  it('refuses when the server map is the wrong type', () => {
    const out = mergeServerEntry(
      JSON.stringify({ mcpServers: 'nonsense' }),
      claude,
      URL,
      TOKEN
    );
    expect(out.ok).toBe(false);
  });

  it('explains which file it left alone', () => {
    const out = mergeServerEntry('{bad', claude, URL, TOKEN);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toContain('.mcp.json');
  });
});

describe('writeAgentConfigs', () => {
  let project: string;
  let home: string;

  beforeEach(async () => {
    project = await fs.mkdtemp(join(tmpdir(), 'scamp-proj-'));
    home = await fs.mkdtemp(join(tmpdir(), 'scamp-home-'));
  });

  afterEach(async () => {
    await fs.rm(project, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
  });

  const run = () =>
    writeAgentConfigs({ projectPath: project, homeDir: home, url: URL, token: TOKEN });

  const read = async (relative: string): Promise<string> =>
    fs.readFile(join(project, relative), 'utf-8');

  const exists = async (relative: string): Promise<boolean> => {
    try {
      await fs.access(join(project, relative));
      return true;
    } catch {
      return false;
    }
  };

  it('writes Claude Code even with no agents installed', async () => {
    const report = await run();
    expect(report.written).toContain('.mcp.json');
    expect(JSON.parse(await read('.mcp.json')).mcpServers[SERVER_KEY]).toBeDefined();
  });

  it('creates no directories for agents that are not installed', async () => {
    // Littering every project with .cursor/, .gemini/, .kiro/ for tools the
    // user doesn't have would be its own bug.
    await run();
    expect(await exists('.cursor')).toBe(false);
    expect(await exists('.gemini')).toBe(false);
    expect(await exists('.kiro')).toBe(false);
  });

  it('writes nothing through a symlink that leads outside the project', async () => {
    // A cloned project could link .cursor to the user's own ~/.cursor.
    await fs.mkdir(join(home, '.cursor'), { recursive: true });
    const outside = await fs.mkdtemp(join(tmpdir(), 'scamp-outside-'));
    try {
      await fs.symlink(outside, join(project, '.cursor'));
      const report = await run();
      expect(report.written).not.toContain('.cursor/mcp.json');
      expect(report.skipped.map((s) => s.path)).toContain('.cursor/mcp.json');
      expect(await fs.readdir(outside)).toEqual([]);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it('writes a detected agent config, creating its directory', async () => {
    await fs.mkdir(join(home, '.cursor'), { recursive: true });
    const report = await run();
    expect(report.written).toContain('.cursor/mcp.json');
    expect(JSON.parse(await read('.cursor/mcp.json')).mcpServers[SERVER_KEY].url).toBe(
      URL
    );
  });

  it('writes a nested config path', async () => {
    await fs.mkdir(join(home, '.kiro'), { recursive: true });
    await run();
    expect(JSON.parse(await read('.kiro/settings/mcp.json')).mcpServers[SERVER_KEY])
      .toBeDefined();
  });

  it('preserves an existing config it merges into', async () => {
    await fs.writeFile(
      join(project, '.mcp.json'),
      JSON.stringify({ mcpServers: { other: { url: 'https://example/mcp' } } }),
      'utf-8'
    );
    await run();
    const after = JSON.parse(await read('.mcp.json'));
    expect(after.mcpServers.other.url).toBe('https://example/mcp');
    expect(after.mcpServers[SERVER_KEY]).toBeDefined();
  });

  it('leaves a malformed config exactly as it found it', async () => {
    const original = '{ half written';
    await fs.writeFile(join(project, '.mcp.json'), original, 'utf-8');
    const report = await run();
    expect(await read('.mcp.json')).toBe(original);
    expect(report.written).not.toContain('.mcp.json');
    expect(report.skipped.map((s) => s.path)).toContain('.mcp.json');
  });

  it('still writes the other agents when one config is unmergeable', async () => {
    await fs.mkdir(join(home, '.cursor'), { recursive: true });
    await fs.writeFile(join(project, '.mcp.json'), '{bad', 'utf-8');
    const report = await run();
    expect(report.written).toContain('.cursor/mcp.json');
    expect(report.skipped.map((s) => s.path)).toContain('.mcp.json');
  });

  it('gitignores everything it wrote', async () => {
    // These hold a localhost URL and a token — committing one leaks the
    // token and gives teammates a dead URL.
    await run();
    const gitignore = await read('.gitignore');
    expect(gitignore).toContain('.mcp.json');
  });

  it('appends to an existing .gitignore without disturbing it', async () => {
    await fs.writeFile(join(project, '.gitignore'), 'node_modules\n.scamp/\n', 'utf-8');
    await run();
    const gitignore = await read('.gitignore');
    expect(gitignore).toContain('node_modules');
    expect(gitignore).toContain('.scamp/');
    expect(gitignore).toContain('.mcp.json');
  });

  it('does not duplicate a gitignore entry across launches', async () => {
    await run();
    await run();
    const lines = (await read('.gitignore'))
      .split('\n')
      .filter((line) => line.trim() === '.mcp.json');
    expect(lines).toHaveLength(1);
  });

  it('rewrites the entry when the port changes', async () => {
    await run();
    await writeAgentConfigs({
      projectPath: project,
      homeDir: home,
      url: 'http://127.0.0.1:39845/mcp',
      token: TOKEN,
    });
    expect(JSON.parse(await read('.mcp.json')).mcpServers[SERVER_KEY].url).toBe(
      'http://127.0.0.1:39845/mcp'
    );
  });
});

describe('isAgentInstalled', () => {
  let home: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(join(tmpdir(), 'scamp-home-'));
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  it('is always true for a target with no markers', async () => {
    expect(await isAgentInstalled(claude, home)).toBe(true);
  });

  it('is false when the marker is absent', async () => {
    expect(await isAgentInstalled(cursor, home)).toBe(false);
  });

  it('is true when the marker exists', async () => {
    await fs.mkdir(join(home, '.cursor'), { recursive: true });
    expect(await isAgentInstalled(cursor, home)).toBe(true);
  });
});

describe('ensureGitignoreEntries', () => {
  let project: string;

  beforeEach(async () => {
    project = await fs.mkdtemp(join(tmpdir(), 'scamp-gi-'));
  });

  afterEach(async () => {
    await fs.rm(project, { recursive: true, force: true });
  });

  it('does nothing when given no paths', async () => {
    await ensureGitignoreEntries(project, []);
    await expect(fs.access(join(project, '.gitignore'))).rejects.toThrow();
  });

  it('adds a trailing newline before appending to a file without one', async () => {
    await fs.writeFile(join(project, '.gitignore'), 'node_modules', 'utf-8');
    await ensureGitignoreEntries(project, ['.mcp.json']);
    const out = await fs.readFile(join(project, '.gitignore'), 'utf-8');
    expect(out).toMatch(/node_modules\n/);
    expect(out).toContain('.mcp.json');
  });
});
