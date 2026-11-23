import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Codex keeps its config in TOML: a project's own `.codex/config.toml`
 * (read only in a folder the user trusts) and `~/.codex/config.toml`.
 * Scamp edits the first line by line, without a TOML library, and only
 * ever reads the second. see docs/plans/embedded-codex-connection-plan.md
 */

export type TomlMerge = { ok: true; content: string } | { ok: false; reason: string };

const tomlValue = (value: unknown): string => {
  if (typeof value === 'object' && value !== null) {
    const pairs = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)} = ${tomlValue(v)}`);
    return `{ ${pairs.join(', ')} }`;
  }
  // A JSON string's escapes are all valid in a TOML basic string.
  return JSON.stringify(value);
};

/** `[a."b" . c]` → `a.b.c`, `[[x]]` → null: good enough to tell our tables from the rest. */
const headerName = (line: string): string | null => {
  const match = /^\s*\[(?!\[)([^\]]*)\]\s*(#.*)?$/.exec(line);
  return match?.[1] === undefined ? null : match[1].replace(/\s+/g, '').replace(/["']/g, '');
};
// shortcut: a line of a multi-line array that reads like `[a]` is taken for a header; Codex's config has none.
const isHeader = (line: string): boolean => /^\s*\[\[?[^\]]+\]\]?\s*(#.*)?$/.test(line);

/** Where each line sits: inside a multi-line string, or under which table (`''` before the first). */
const scan = (lines: ReadonlyArray<string>): Array<{ inString: boolean; table: string | null }> => {
  const out: Array<{ inString: boolean; table: string | null }> = [];
  let open: '"""' | "'''" | null = null;
  let table: string | null = '';
  for (const line of lines) {
    const startsInside = open !== null;
    if (!startsInside && isHeader(line)) table = headerName(line);
    out.push({ inString: startsInside, table });
    for (const quote of ['"""', "'''"] as const) {
      if (open !== null && open !== quote) continue;
      if (line.split(quote).length % 2 === 0) open = open === null ? quote : null;
    }
  }
  return out;
};

const ours = (table: string | null, key: string): boolean => table === key || (table?.startsWith(`${key}.`) ?? false);

/**
 * Put `[<serversKey>.<serverKey>]` with `entry` into an existing config,
 * replacing our own table and leaving every other line as it was. Refuses
 * when our server is set some way this can't replace safely.
 */
export const mergeTomlServerEntry = (
  existing: string | null,
  configPath: string,
  serversKey: string,
  serverKey: string,
  entry: Record<string, unknown>
): TomlMerge => {
  const key = `${serversKey}.${serverKey}`;
  const eol = existing?.includes('\r\n') === true ? '\r\n' : '\n';
  const table = [`[${key}]`, ...Object.entries(entry).map(([k, v]) => `${k} = ${tomlValue(v)}`)];
  if (existing === null || existing.trim().length === 0) return { ok: true, content: `${table.join(eol)}${eol}` };

  const lines = existing.split(/\r?\n/);
  const where = scan(lines);
  const refuse = (why: string): TomlMerge => ({ ok: false, reason: `${configPath} ${why}, leaving it untouched.` });
  if (where.at(-1)?.inString === true) return refuse('has a string that never ends');
  for (const [i, line] of lines.entries()) {
    const at = where[i];
    if (at === undefined || at.inString || isHeader(line)) continue;
    // `mcp_servers.scamp.url = …` or `mcp_servers = { … }` at the top, or `scamp.url = …` under `[mcp_servers]`.
    if (at.table === '' && new RegExp(`^\\s*["']?${serversKey}["']?\\s*[.=]`).test(line)) return refuse(`sets ${serversKey} with dotted keys`);
    if (at.table === serversKey && new RegExp(`^\\s*["']?${serverKey}["']?\\s*[.=]`).test(line)) return refuse(`sets ${key} with dotted keys`);
  }

  const kept: string[] = [];
  let insertAt = -1;
  for (const [i, line] of lines.entries()) {
    const at = where[i];
    if (at !== undefined && ours(at.table, key)) {
      if (insertAt === -1) insertAt = kept.length;
      continue;
    }
    kept.push(line);
  }
  // Ours goes where it was, or at the end after a blank line.
  if (insertAt === -1) {
    while (kept.length > 0 && kept.at(-1)?.trim() === '') kept.pop();
    kept.push('', ...table, '');
  } else {
    kept.splice(insertAt, 0, ...table, ...(kept[insertAt] === undefined || kept[insertAt]?.trim() === '' ? [] : ['']));
    if (kept.at(-1) !== '') kept.push('');
  }
  return { ok: true, content: kept.join(eol) };
};

/** True when `~/.codex/config.toml` trusts any of `folders`; null when Codex isn't installed. */
export const codexTrusts = async (homeDir: string, folders: ReadonlyArray<string>): Promise<boolean | null> => {
  try {
    await fs.access(join(homeDir, '.codex'));
  } catch {
    return null;
  }
  const content = await fs.readFile(join(homeDir, '.codex', 'config.toml'), 'utf-8').catch(() => '');
  return trustedIn(content, folders);
};

/** Pure half of `codexTrusts`: anything unclear reads as not trusted. */
export const trustedIn = (content: string, folders: ReadonlyArray<string>): boolean => {
  const lines = content.split(/\r?\n/);
  const where = scan(lines);
  const wanted = new Set(folders.map((f) => `projects.${f.replace(/\s+/g, '')}`));
  return lines.some((line, i) => {
    const at = where[i];
    return at !== undefined && !at.inString && !isHeader(line) && at.table !== null && wanted.has(at.table) && /^\s*trust_level\s*=\s*["']trusted["']/.test(line);
  });
};

/** Starts Codex with Scamp's server for this run only: no file, and no trusted folder needed. */
export const codexLaunchCommand = (serverKey: string, entry: Record<string, unknown>): string =>
  ['codex', ...Object.entries(entry).map(([k, v]) => `-c 'mcp_servers.${serverKey}.${k}=${tomlValue(v)}'`)].join(' ');
