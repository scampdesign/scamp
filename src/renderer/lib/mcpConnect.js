const HEADER = 'X-Scamp-Token';
/** JSON for pasting, two-space indented as these tools' docs write it. */
const json = (value) => JSON.stringify(value, null, 2);
/** A TOML basic string: quotes and backslashes escaped. */
const tomlString = (value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
export const connectSnippets = (url, token) => [
    {
        id: 'claude-code',
        label: 'Claude Code',
        hint: 'Run in the project folder',
        text: `claude mcp add --transport http scamp "${url}" --header "${HEADER}: ${token}"`,
    },
    {
        id: 'codex',
        label: 'Codex',
        // `codex mcp add` takes no custom header, so this is config.
        hint: 'Add to ~/.codex/config.toml',
        text: [
            '[mcp_servers.scamp]',
            `url = ${tomlString(url)}`,
            `http_headers = { ${tomlString(HEADER)} = ${tomlString(token)} }`,
        ].join('\n'),
    },
    {
        id: 'opencode',
        label: 'OpenCode',
        hint: 'Add to opencode.json in the project',
        text: json({
            $schema: 'https://opencode.ai/config.json',
            mcp: { scamp: { type: 'remote', url, enabled: true, headers: { [HEADER]: token } } },
        }),
    },
    {
        id: 'gemini-cli',
        label: 'Gemini CLI',
        hint: 'Run in the project folder',
        text: `gemini mcp add --transport http --header "${HEADER}: ${token}" scamp "${url}"`,
    },
    {
        id: 'cursor',
        label: 'Cursor',
        hint: 'Add to .cursor/mcp.json',
        text: json({ mcpServers: { scamp: { url, headers: { [HEADER]: token } } } }),
    },
    {
        id: 'vscode',
        label: 'VS Code',
        hint: 'Add to .vscode/mcp.json',
        text: json({ servers: { scamp: { type: 'http', url, headers: { [HEADER]: token } } } }),
    },
    {
        id: 'other',
        label: 'Other tools',
        hint: `A streamable HTTP server with the ${HEADER} header`,
        text: json({ url, headers: { [HEADER]: token } }),
    },
];
