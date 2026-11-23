# Connect Codex to Embedded Scamp

Status: built, 2026-11-23, apart from the hand checks in step 4. Tested:
typecheck clean, 4,993 unit and integration tests pass, and e2e
`embedded-own-agent`, `mcp-server`, `embedded-modes`, `embedded-edit`,
`embedded-rails`, and `embedded-states` pass (25 tests).

The Codex row is shared with the canvas's MCP server
(`src/main/mcp/lifecycle.ts`), so a Scamp project gets a `.codex/config.toml`
too, with `approve` covering the canvas's tools.

## The problem

With **My agent**, Claude Code connects by doing nothing: Scamp writes
`.mcp.json`, the user starts `claude`, allows the `scamp` server once, and
it's connected. Codex gets none of that.

- **Scamp writes no Codex config.** `AGENT_TARGETS` in
  `src/main/mcp/agentConfig.ts` lists Claude Code, Cursor, Gemini CLI, and
  Kiro. Codex is "deliberately absent, pending verification": its config is
  TOML, and project-level support was unconfirmed.
- **There's no command a Codex user can paste.** The window's fallback is
  `claude mcp add …` (`ownAgentStatus` in `src/main/embedded/window.ts`).
  `codex mcp add --url` can't set a custom header, only
  `--bearer-token-env-var`, and Scamp's server checks `X-Scamp-Token`. So a
  Codex user hand-writes TOML, and the obvious place, `~/.codex/config.toml`,
  is global, while the URL's token is per project.
- **The window only speaks Claude Code.** The button is **Start Claude
  Code**, and the hint names Cursor, Gemini CLI, and Kiro, not Codex.

## What Codex supports (verified on codex-cli 0.171.0, 2026-11-23)

Checked against a throwaway `CODEX_HOME` and a fake MCP server that answers
like Scamp's (401 without the token, 405 to GET).

- **A project's own `.codex/config.toml` is read, but only in a trusted
  folder.** Codex loads `[mcp_servers.scamp]` from it when
  `~/.codex/config.toml` has `[projects."<path>"] trust_level = "trusted"`
  for the folder or its git root. In an untrusted folder the file is
  **ignored silently**: no warning, the server just isn't there. A config in
  a subfolder of the repository (`riq_railsapp/riq`) is found either way.
- **Headers work.** `http_headers = { "X-Scamp-Token" = "…" }` sends the
  token on every request. A session ran `initialize`, then `tools/list`,
  against the fake server.
- **Codex probes OAuth first.** It sends `GET /mcp` and the `.well-known`
  discovery paths, plus one `HEAD /mcp` without the token. Scamp's 401 and
  405 answers don't stop it connecting.
- **Per-server settings exist:** `tool_timeout_sec`, `startup_timeout_sec`,
  and `default_tools_approval_mode`, which takes `auto`, `prompt`, `writes`,
  or `approve`. An unknown value stops Codex from starting at all ("failed to
  load bootstrap configuration"), so the value must be exact.
- **`-c` overrides register the server for one run, with no file and no
  trust:**
  `codex -c 'mcp_servers.scamp.url="…"' -c 'mcp_servers.scamp.http_headers={"X-Scamp-Token"="…"}'`.
  `codex mcp get scamp` shows it as `streamable_http`, with the header.

Not verified, because each needs a real model session:

1. Whether trusting the folder at Codex's own first-run prompt loads the
   project config in that same session, or only after a restart.
2. Whether Codex asks to approve each `scamp_embedded_wait_for_edits` call
   by default. The queue calls it every 50 seconds, so a prompt per call
   would make the loop unusable.
3. Whether Codex keeps looping on the queue, as the prompt asks, or stops
   after one batch.

## Plan

### 1. Write `.codex/config.toml`

Add a Codex row to `AGENT_TARGETS`, detected by `~/.codex`, with the
project's `.codex/config.toml` as its file. The entry:

```toml
[mcp_servers.scamp]
url = "http://127.0.0.1:39861/mcp"
http_headers = { "X-Scamp-Token" = "<token>" }
default_tools_approval_mode = "approve"
```

- **`approve` covers only Scamp's three tools.** They read the queue and the
  selection and write nothing; Codex still asks about its own file writes
  as the user's settings say. Setting it removes question 2 above.
- **No `tool_timeout_sec`.** The longest call is 50 seconds
  (`MAX_WAIT_SECONDS`), under Codex's default of 60.
- **TOML without a TOML dependency.** `AgentTarget` gets a `merge` function
  in place of `serversKey`. The JSON rows keep `mergeServerEntry`; the
  Codex row gets a line-based merge of about 30 lines:
  - No file, or an empty one: write the table.
  - A file without `[mcp_servers.scamp]`: append the table.
  - A file with it: replace that table, and any `[mcp_servers.scamp.*]`
    subtable, up to the next header that isn't one of ours.
  - Refuse, as the JSON merge does, when `scamp` is set some other way: a
    dotted key (`mcp_servers.scamp.url = …`), an inline `mcp_servers = {…}`,
    or a multi-line string the scan can't see past. The report then shows
    the reason, and the fallback in step 3 still works.
- Everything else already applies: a file the project tracks in git is
  skipped, a symlink out of the project is refused, and the file goes in
  `.git/info/exclude`.

### 2. Tell the user when the folder isn't trusted

Codex ignores the file in an untrusted folder without saying so, and that's
the one failure a Codex user can't diagnose.

- Read `~/.codex/config.toml` (read only, never written) for a
  `[projects."<folder>"]` or `[projects."<git root>"]` table with
  `trust_level = "trusted"`. A regex over the header line and the next key
  is enough; anything unclear reads as "not trusted", which only adds a
  sentence.
- Add a `codexTrusted: boolean | null` field to `EmbeddedOwnAgentStatus`
  (null when Codex isn't installed). When it's false, the Codex step says:
  "When Codex asks whether to trust this folder, choose **Yes**." Question 1
  above decides whether it also says to restart Codex.

### 3. Give Codex its own button and fallback

In `AgentConnect.tsx`:

- **Step 1 offers both agents installed:** **Start Claude Code** and
  **Start Codex**. Each button types its command into the terminal.
- **Start Codex types the `-c` command, not plain `codex`.** It connects
  whether the file was written or skipped and whether the folder is trusted
  or not, so the button works every time. It types the token into the
  terminal, which is the same token already in the project's files.
- **The fallback depends on the agent.** `command` becomes
  `commands: { claudeCode, codex }` in the status, and the window shows the
  one for the agent whose file was skipped.
- The hint lists Codex with the others, and the guide's **Use your own
  agent** section gets a Codex step.

### 4. Tests

- **Unit** (`test/agentConfig.test.ts`): the TOML merge cases:
  - a new file;
  - a file with other servers, kept byte for byte;
  - replacing our table and its subtable;
  - CRLF line endings;
  - each refusal: a dotted key, an inline table, a multi-line string.
- **Unit:** the trust check on a folder, on its git root, on a missing file,
  and on a `trust_level` other than `trusted`.
- **e2e** (`embedded-own-agent.spec.ts`): with a fake home that has
  `.codex/`, `.codex/config.toml` is written and excluded from git. The MCP
  calls themselves are already covered, and they don't depend on the client.
- **By hand, on `riq_railsapp`, with real Codex:**
  - questions 1–3 above;
  - **Start Codex**, then the prompt: a batch is written, and
    `scamp_embedded_done` shows the diff;
  - minimize the window and reopen it while Codex waits.

### 5. Docs

- The comment in `agentConfig.ts`: Codex moves from "deliberately absent"
  to verified, with the trust caveat.
- `docs/plans/embedded-agent-connection-plan.md`, the user guide, and a
  CHANGELOG entry: "**In Edit React Project, Codex connects the way Claude
  Code does.**"

## Left out

- **Writing `~/.codex/config.toml`.** It's global, the token is per
  project, and a second project's write would replace the first's entry.
  Step 3's `-c` command covers the user who doesn't want a project file.
- **Marking the folder trusted for the user.** That's Codex's security
  decision to ask about, not Scamp's.
- **Accepting `Authorization: Bearer`** so that `codex mcp add
  --bearer-token-env-var` would work. Steps 1 and 3 already connect with
  less setup.
- **VS Code**, still unverified, as `agentConfig.ts` says.
