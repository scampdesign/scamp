import { describe, it, expect } from 'vitest';

import { connectSnippets } from '@lib/mcpConnect';

const URL = 'http://127.0.0.1:39841/mcp';
const TOKEN = 'tok_abc123';
const byId = (id: string): string => connectSnippets(URL, TOKEN).find((s) => s.id === id)?.text ?? '';

describe('connectSnippets', () => {
  it('lists each tool once, Claude Code first and the generic shape last', () => {
    const ids = connectSnippets(URL, TOKEN).map((s) => s.id);
    expect(ids[0]).toBe('claude-code');
    expect(ids[ids.length - 1]).toBe('other');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('builds the Claude Code and Gemini CLI commands with the token header', () => {
    expect(byId('claude-code')).toBe(`claude mcp add --transport http scamp "${URL}" --header "X-Scamp-Token: ${TOKEN}"`);
    expect(byId('gemini-cli')).toBe(`gemini mcp add --transport http --header "X-Scamp-Token: ${TOKEN}" scamp "${URL}"`);
  });

  it('writes Codex config as a TOML table with http_headers', () => {
    expect(byId('codex')).toBe(
      ['[mcp_servers.scamp]', `url = "${URL}"`, `http_headers = { "X-Scamp-Token" = "${TOKEN}" }`].join('\n')
    );
  });

  it('escapes quotes and backslashes in TOML strings', () => {
    const text = connectSnippets('http://x/"a"\\b', 't"k').find((s) => s.id === 'codex')?.text ?? '';
    expect(text).toContain('url = "http://x/\\"a\\"\\\\b"');
    expect(text).toContain('"X-Scamp-Token" = "t\\"k"');
  });

  it('writes each JSON config in its tool’s own shape, and as valid JSON', () => {
    expect(JSON.parse(byId('opencode'))).toEqual({
      $schema: 'https://opencode.ai/config.json',
      mcp: { scamp: { type: 'remote', url: URL, enabled: true, headers: { 'X-Scamp-Token': TOKEN } } },
    });
    expect(JSON.parse(byId('cursor'))).toEqual({ mcpServers: { scamp: { url: URL, headers: { 'X-Scamp-Token': TOKEN } } } });
    expect(JSON.parse(byId('vscode'))).toEqual({
      servers: { scamp: { type: 'http', url: URL, headers: { 'X-Scamp-Token': TOKEN } } },
    });
    expect(JSON.parse(byId('other'))).toEqual({ url: URL, headers: { 'X-Scamp-Token': TOKEN } });
  });
});
