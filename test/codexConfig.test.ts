import { describe, expect, it } from 'vitest';

import { codexLaunchCommand, mergeTomlServerEntry, trustedIn, type TomlMerge } from '../src/main/mcp/codexConfig';

const PATH = '.codex/config.toml';
const ENTRY = { url: 'http://127.0.0.1:39841/mcp', http_headers: { 'X-Scamp-Token': 'tok-1' }, default_tools_approval_mode: 'approve' };
const OURS = [
  '[mcp_servers.scamp]',
  'url = "http://127.0.0.1:39841/mcp"',
  'http_headers = { "X-Scamp-Token" = "tok-1" }',
  'default_tools_approval_mode = "approve"',
].join('\n');

const merge = (existing: string | null): TomlMerge => mergeTomlServerEntry(existing, PATH, 'mcp_servers', 'scamp', ENTRY);
const content = (result: TomlMerge): string => {
  if (!result.ok) throw new Error(`expected a merge: ${result.reason}`);
  return result.content;
};

describe('mergeTomlServerEntry — creating', () => {
  it('writes only our table when there is no file', () => {
    expect(content(merge(null))).toBe(`${OURS}\n`);
  });

  it('treats a blank file as absent', () => {
    expect(content(merge('  \n'))).toBe(`${OURS}\n`);
  });
});

describe('mergeTomlServerEntry — keeping what the user had', () => {
  it('appends our table after the user’s settings and servers, keeping them byte for byte', () => {
    const existing = 'model = "o3"\n\n[mcp_servers.other]\ncommand = "x"\nargs = [ "a" ]\n';
    expect(content(merge(existing))).toBe(`model = "o3"\n\n[mcp_servers.other]\ncommand = "x"\nargs = [ "a" ]\n\n${OURS}\n`);
  });

  it('replaces our table where it was, and leaves the tables around it', () => {
    const existing = '[a]\nx = 1\n\n[mcp_servers.scamp]\nurl = "http://old"\n\n[b]\ny = 2\n';
    expect(content(merge(existing))).toBe(`[a]\nx = 1\n\n${OURS}\n\n[b]\ny = 2\n`);
  });

  it('removes our subtables with our table', () => {
    const existing = '[mcp_servers.scamp]\nurl = "http://old"\n\n[mcp_servers.scamp.tools.x]\napproval_mode = "prompt"\n\n[b]\ny = 2\n';
    expect(content(merge(existing))).toBe(`${OURS}\n\n[b]\ny = 2\n`);
  });

  it('recognizes our table written with quotes and spaces', () => {
    const existing = '[ mcp_servers . "scamp" ]\nurl = "http://old"\n';
    expect(content(merge(existing))).toBe(`${OURS}\n`);
  });

  it('leaves a server whose name only starts with ours', () => {
    const existing = '[mcp_servers.scamp2]\nurl = "http://keep"\n';
    expect(content(merge(existing))).toContain('[mcp_servers.scamp2]\nurl = "http://keep"');
  });

  it('is the same after a second merge', () => {
    const once = content(merge('model = "o3"\n'));
    expect(content(merge(once))).toBe(once);
  });

  it('keeps Windows line endings', () => {
    const result = content(merge('model = "o3"\r\n'));
    expect(result).toBe(`model = "o3"\r\n\r\n${OURS.replace(/\n/g, '\r\n')}\r\n`);
  });

  it('ignores a header-like line inside a multi-line string', () => {
    const existing = 'notes = """\n[mcp_servers.scamp]\n"""\n';
    expect(content(merge(existing))).toBe(`notes = """\n[mcp_servers.scamp]\n"""\n\n${OURS}\n`);
  });
});

describe('mergeTomlServerEntry — refusing rather than clobbering', () => {
  it('refuses a top-level dotted key for our server', () => {
    const result = merge('mcp_servers.scamp.url = "http://x"\n');
    expect(result).toEqual({ ok: false, reason: `${PATH} sets mcp_servers with dotted keys, leaving it untouched.` });
  });

  it('refuses an inline server map', () => {
    expect(merge('mcp_servers = { scamp = { url = "x" } }\n').ok).toBe(false);
  });

  it('refuses our server set under [mcp_servers]', () => {
    const result = merge('[mcp_servers]\nscamp.url = "http://x"\n');
    expect(result).toEqual({ ok: false, reason: `${PATH} sets mcp_servers.scamp with dotted keys, leaving it untouched.` });
  });

  it('refuses a multi-line string that never ends', () => {
    expect(merge('notes = """\nnever closed\n').ok).toBe(false);
  });
});

describe('trustedIn', () => {
  const config = '[projects."/home/me/app"]\ntrust_level = "trusted"\n\n[projects."/home/me/other"]\ntrust_level = "untrusted"\n';

  it('is true for a trusted folder', () => {
    expect(trustedIn(config, ['/home/me/app'])).toBe(true);
  });

  it('is true when only the git root is trusted', () => {
    expect(trustedIn(config, ['/home/me/app/riq', '/home/me/app'])).toBe(true);
  });

  it('is false for a folder marked untrusted', () => {
    expect(trustedIn(config, ['/home/me/other'])).toBe(false);
  });

  it('is false for a folder that isn’t listed', () => {
    expect(trustedIn(config, ['/home/me/new'])).toBe(false);
  });

  it('is false for an empty config', () => {
    expect(trustedIn('', ['/home/me/app'])).toBe(false);
  });

  it('reads a path with dots and single quotes', () => {
    expect(trustedIn("[projects.'/home/me/my.app']\ntrust_level = 'trusted'\n", ['/home/me/my.app'])).toBe(true);
  });
});

describe('codexLaunchCommand', () => {
  it('passes each setting as a -c override for this run', () => {
    expect(codexLaunchCommand('scamp', ENTRY)).toBe(
      `codex -c 'mcp_servers.scamp.url="http://127.0.0.1:39841/mcp"' -c 'mcp_servers.scamp.http_headers={ "X-Scamp-Token" = "tok-1" }' -c 'mcp_servers.scamp.default_tools_approval_mode="approve"'`
    );
  });
});
