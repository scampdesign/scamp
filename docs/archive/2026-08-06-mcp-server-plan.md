# Scamp MCP server — Plan

Backlog: `docs/ai-backlog.md` story 3 (the design brief; read `:211-386`).
Status: **implemented** — Phases 0–6 complete, 2262 unit tests + 12 e2e passing.
Builds on stories 1 and 2, which shipped `lib/contextModel.ts` — the shared
facts layer this story is the third consumer of, exactly as those plans
predicted.

## Goal

An agent running in the Scamp terminal can call `scamp_get_selected_element()`
and get a structured answer about the live canvas, instead of relying on the
user to describe what they clicked or on a context file that may be a moment
stale.

---

## Two corrections to the brief, before anything else

**Claude Code compatibility needs no pre-work — it needs the corrections
below.** Nothing in Scamp blocks it, and no foundation is missing; the brief's
own sketch is the only obstacle, and it's replaced in Phase 2. Evidence that
the target works today: the `figma` server on this machine is registered as
`{"type": "http", "url": "https://mcp.figma.com/mcp"}` and connects fine, so
Claude Code's Streamable HTTP client path is proven — we just have to speak
the protocol on our end.

Both problems below are in the same area and are worth settling before we
build.

### 1. The sketch is not MCP

It shows a bare HTTP endpoint taking `{tool, params}` and returning
`{result}`. MCP is **JSON-RPC 2.0** with a mandatory handshake. A client
that connects to that endpoint gets nothing usable:

| What MCP requires | The brief's sketch |
|---|---|
| `initialize` request → `{protocolVersion, capabilities, serverInfo}` | no handshake at all |
| `notifications/initialized` (no response; HTTP 202) | — |
| `tools/list` → `{tools: [{name, description, inputSchema}]}` | tools are undiscoverable |
| `tools/call` with `{name, arguments}` → `{content: [{type:"text", …}]}` | `{tool, params}` → `{result}` |
| JSON-RPC envelope (`jsonrpc`, `id`, `method`, `error`) | plain objects |

Without `tools/list` the agent cannot discover a single tool, so the feature
does not function at all — this isn't a polish issue.

Note also that **tool failures are not JSON-RPC errors.** A tool that can't
answer returns a normal result with `isError: true`; JSON-RPC errors are
reserved for protocol faults (unknown method, malformed request). Conflating
them is the most common way a hand-rolled server misbehaves.

### 2. The `agent.md` connect command is wrong

The brief has:

```bash
claude mcp add scamp $(cat .scamp/mcp.json | jq -r '.url')
```

`claude mcp add` **defaults to stdio** (verified against the installed CLI's
`--help`), so this registers the URL as a *command to execute*. The HTTP form
needs the transport flag:

```bash
claude mcp add --transport http scamp "$(jq -r .url .scamp/mcp.json)"
```

---

## What already exists

- **`lib/contextModel.ts` derives most of the facts.** `ContextElement`
  already carries id, class, tag, name, parent, chain, declarations, custom
  properties, and structurally-described children. `scamp_get_selected_element`
  is close to a re-serialisation of it.
- **`contextInline.ts` already parses declarations into a map**
  (`parseDeclarations`, `:31`). The brief wants `styles` as an object rather
  than `prop: value;` lines — that function is the conversion, and it should
  move into `contextModel` so all three consumers share it.
- **`.scamp/` is safe to write into.** The watcher ignores dotfiles
  (`watcher.ts:56`) with a defensive guard at `:225`, and the scaffolder puts
  `.scamp/` in both `.gitignore` templates (`projectScaffold.ts:193,203`).
  `mcp.json` can sit beside `context.md` with no watcher churn.
- **Port allocation already exists** — `devServer/portAlloc.ts` binds an
  ephemeral port to find a free one. Useful precedent for *how* to probe a
  port, but **not** the right strategy here; see Lifecycle for why this
  server needs a stable one.
- **One window, one project.** `createWindow()` is called once (and again on
  macOS activate only when zero windows exist). One server per app, following
  whichever project is open.
- **Main-process modules can be unit tested.** Story 1 added
  `src/main/ipc/contextOps.ts` to `tsconfig.web.json`'s `include` so Vitest
  could import it. Same trick applies here.

---

## Decision 1: hand-roll the protocol, don't take the SDK

`@modelcontextprotocol/sdk@1.30.0` pulls **17 transitive dependencies** —
`express@5`, `hono`, `jose`, `ajv`, `zod`, `cors`, `eventsource`,
`pkce-challenge`, and more. That is an HTTP framework, a JOSE/OAuth stack, and
two schema validators, for a server that exposes eight read-only functions on
localhost. CLAUDE.md's "keep the bundle lean" rule points hard away from it.

**Recommendation: hand-roll**, on Node's built-in `http`. The surface we need
is genuinely small and static:

- `POST /mcp` — parse a JSON-RPC message, dispatch, respond `application/json`
- `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`
- unknown method → JSON-RPC `-32601`; malformed JSON → `-32700`
- `GET /mcp` → **405** (we offer no server-initiated streams, and the spec
  expects that specific refusal rather than a 404)
- notification-only POST bodies (no `id`) → **202** with an empty body

We can skip the optional parts wholesale: no `Mcp-Session-Id` (stateless), no
SSE, no resources, no prompts, no pagination cursor.

**The cost we're accepting** is protocol drift: when MCP revises, we update by
hand. Mitigated by version negotiation being explicitly tolerant — if the
client asks for a `protocolVersion` we don't know, we reply with the one we do
support and the client decides whether to proceed. We pin and echo a single
version string in one constant.

If review prefers correctness-by-dependency over leanness, the SDK is the
other valid answer and the tool layer below is unchanged either way — only the
transport module swaps. Worth deciding now, cheap to reverse later.

## Decision 2: pull state through to the renderer, don't cache it in main

The brief says main keeps canvas state via "the same mechanism that drives
file writes". It doesn't — story 1 sends main a **rendered markdown string**,
not structured state. So this needs designing, and there are two shapes:

**(A) Push-and-cache.** Renderer pushes a serialised snapshot on every store
change; main answers from its copy. Simple, no failure path. But it needs a
debounce (pushing a whole `elements` map on every drag frame is not free), and
a debounce is exactly the staleness the user story exists to eliminate:
*"without relying on a file that might be slightly stale."*

**(B) Pull-through.** An MCP request in main sends a correlated request to the
renderer, which builds the snapshot on demand and replies. Always exactly
current — which is the point of the story.

**Recommendation: (B).** The cost is one round trip (sub-millisecond) plus a
timeout path. Concretely: a `Map<requestId, resolver>` in main,
`webContents.send(IPC.McpQuery, {requestId, tool, args})`, renderer replies on
`IPC.McpQueryResult`, 2s timeout → tool result with `isError: true` and a
plain "the Scamp canvas did not respond" message. No hang, no silent wrong
answer.

Note this also removes any question of what happens when the renderer is
reloaded or the project changes — there is no cache to invalidate.

## Decision 3: the localhost-only claim needs one more line of defence

The brief says "No credentials are needed since only processes running on the
user's own machine can connect." That's the standard underestimate: **any web
page the user has open can `fetch('http://localhost:39841/mcp')`**, and DNS
rebinding defeats naive host checks. The MCP spec calls this out and requires
local HTTP servers to validate `Origin`.

The exposure here is read-only — a page could enumerate the user's design and
class names. Not catastrophic, but the fix is nearly free:

1. **Reject requests carrying a browser `Origin` header.** A legitimate MCP
   client sends none.
2. **Require a token.** Generate one per server start, write it into
   `.scamp/mcp.json`, and require it as a header. `claude mcp add` supports
   `--header`, so the connect line stays one command.

Both, not either. (1) alone is a header check; (2) survives a client that
sends an unexpected `Origin`.

## Decision 4: HTTP now, and what "other agents" actually costs

The brief says the architecture is forward-compatible with Aider and Gemini
CLI. Mostly true, with one caveat worth knowing before we commit: **MCP has
three transports, and not every client speaks all three** — stdio, Streamable
HTTP (current), and the deprecated HTTP+SSE it replaced. A client that only
speaks stdio cannot connect to an HTTP server at all.

There's a live example of the alternative on this machine. **Pencil — another
Electron desktop design app — ships its MCP server as a stdio binary:**

```json
"pencil": {
  "command": ".../out/mcp-server-linux-x64",
  "args": ["--app", "desktop", "--agent", "claudeCodeCLI"],
  "type": "stdio"
}
```

That's the same problem we have (a desktop app exposing live state), solved
the other way: a small spawned binary that relays to the running app. It's
also currently **failing to connect** on this machine — the AppImage mount
path it was registered with no longer exists — which is a fair illustration of
that approach's own fragility.

Two reasons to stay with HTTP anyway:

1. **stdio can't reach live state on its own.** The agent spawns the server as
   a child process, so it isn't inside Electron and has no canvas. It would
   need a socket back to the app — i.e. our transport problem plus a second
   hop and a second process to keep alive.
2. **The tool layer is transport-agnostic.** Phases 1 and 3 don't care. If a
   user's agent turns out to be stdio-only, the answer is a ~50-line bridge
   binary that pipes stdin/stdout to our local HTTP endpoint — additive, and
   only worth writing once someone actually needs it.

So: HTTP now, and treat a stdio bridge as a later, cheap add-on rather than
something to design for up front.

## Decision 5: Scamp writes the agent's config — the user runs nothing

**Resolves questions 3, 7, and 8 together.** They were all the same problem:
registration friction. It turns out the friction is removable entirely.

`claude mcp add --scope project` does nothing magic — it writes a plain
`.mcp.json` at the project root. Verified:

```json
{
  "mcpServers": {
    "scamp": {
      "type": "http",
      "url": "http://127.0.0.1:39841/mcp",
      "headers": { "X-Scamp-Token": "abc123" }
    }
  }
}
```

**So Scamp writes that file when it starts the server.** The user opens their
project in Scamp, opens their agent, and the server is already registered.
Zero commands, ever — which is the bar you set.

Three properties make this safe rather than presumptuous:

1. **The watcher already ignores it.** `.mcp.json` starts with a dot, so the
   dotfile regex (`watcher.ts:56`) excludes it. No sync-bridge pause, no
   auto-snapshot, same reasoning that makes `.scamp/` safe.
2. **Claude Code asks before trusting it — and Phase 0 showed this is a
   harder gate than I assumed.** A project-scoped server reports
   `⏸ Pending approval (run \`claude\` to approve)` and **does not connect at
   all** until approved in an interactive session. It is not a dialog that
   appears while you work; it's a state the server sits in until the user
   runs `claude` and approves.

   So the honest claim is **"zero commands, one approval"** — not the "zero
   friction" I wrote earlier. Still far better than typing a registration
   command, and the approval is a genuine security boundary rather than
   friction for its own sake: it's the user consenting to a local server
   reading their project.

   **Do not try to pre-approve it.** Claude Code exposes settings that can
   auto-enable `.mcp.json` servers, and writing those from Scamp would be
   bypassing a trust control on the user's behalf — exactly the kind of thing
   a design tool should not do silently. The right move is to *tell* the user
   approval is pending, which is now a job for the terminal hint in Phase 6.
3. **The token becomes free.** The entire cost of question 3 was "the user
   types a longer command." They now type nothing, so there is no reason not
   to have the token. **Take it.**

**Two implementation requirements this creates:**

- **Merge, never overwrite.** A user may already have `.mcp.json` with their
  own servers. Read it, splice in the `scamp` key, write it back. Clobbering
  someone's MCP config would be a genuinely bad bug — and an easy one to
  write if we treat this as "write a file."
- **Gitignore it.** `.mcp.json` is *conventionally committed* (it's how teams
  share MCP config), but ours holds a machine-local URL and a token.
  Committing it leaks the token and hands teammates a dead URL. Add
  `.mcp.json` to the scaffolder's templates, and append it for existing
  projects when we first write the file.

### Writing configs for other agents too

There's live proof this is the normal thing to do. **Pencil registered itself
with five agents** on this machine — Claude Code, Kiro, Gemini CLI,
Antigravity, and Codex — each in that agent's own config. Whatever else it
got wrong, the multi-agent registration is the right instinct and we should
match it.

The good news is that this is a small table, not five implementations,
because the schemas cluster into **three shapes**:

| Shape | Top-level key | Agents | Confidence |
|---|---|---|---|
| **A — JSON `mcpServers`** | `{"mcpServers": {"scamp": {url, headers}}}` | Claude Code `.mcp.json`, Cursor `.cursor/mcp.json`, Gemini CLI `.gemini/settings.json`, Kiro `.kiro/settings/mcp.json` | Claude Code and Cursor **verified**; Gemini and Kiro schemas read off real files on this machine, but their *project-level* paths need confirming |
| **B — JSON `servers`** | `{"servers": {...}}` (plus `inputs`) | VS Code `.vscode/mcp.json` | **Unverified** — docs 404'd on three URLs. Confirm before writing this one; the key differs from every other agent, so a guess here produces a silently ignored file |
| **C — TOML** | `[mcp_servers.scamp]` | Codex `~/.codex/config.toml` | Schema verified from the real file; project-level support unconfirmed |

Shape A covers four of the five for one serialiser. Claude Code adds
`"type": "http"`; Cursor infers it from `url`. Including `type` in both is
harmless.

**Only write configs for agents we can detect.** Unconditionally creating
`.cursor/`, `.vscode/`, `.gemini/`, and `.kiro/` in every Scamp project would
litter the repo with directories for tools the user doesn't have. Detect via
the agent's global config or binary (`~/.cursor`, `~/.gemini/settings.json`,
`~/.codex/config.toml`, a `code` on `PATH`), and write only those. Claude
Code's `.mcp.json` is the one exception worth writing unconditionally — it's
a single file, no directory, and it's the primary target.

**Merge applies to every one of them**, and matters more here than for
`.mcp.json`: `.vscode/settings.json`-adjacent files and `.gemini/settings.json`
routinely hold unrelated user configuration. Read, splice, write. Never
create-and-clobber.

**Project-level, not user-level — and Pencil shows why.** Pencil registered
globally, so its entry sits in the user's config for every project on the
machine. Right now `claude mcp list` reports it as
`✘ Failed to connect` because the app isn't running — a permanent error in
an unrelated project's session. Project-scoped files confine that failure to
Scamp projects, where "Scamp isn't running" is at least a sensible thing to
be told.

---

## Tool surface — what's actually deliverable

Six of the brief's eight tools map cleanly onto existing store state. Two
need scope changes:

| Tool | Source | Note |
|---|---|---|
| `scamp_get_active_page` | `activePage` / `activeComponent` | Brief only models pages. The component editor is a real state — return a `kind: "page" \| "component"` field rather than lying about which is open. |
| `scamp_get_selected_element` | `contextModel` | Near-direct re-serialisation. `styles` object via the promoted `parseDeclarations`. |
| `scamp_get_element_by_id` | `elements[id]` | Same shape; `null` when absent. |
| `scamp_get_element_tree` | `elements` + `rootElementId` | Nested `{id, class, tag, children}`. |
| `scamp_get_canvas_state` | whole store slice | **See size warning below.** |
| `scamp_list_pages` | `pageNames` + project format | Paths derived, not stored. |
| `scamp_list_components` | `componentTrees` | ⚠️ **`variants` do not exist on `main`** — that work is on a separate branch. Ship name + path now; add `variants` when variants merge. |
| `scamp_get_theme_tokens` | `themeTokens`, `themes` | ⚠️ Brief wants `{colors, typography, spacing}`. `ThemeToken` is a flat `{name, value}` (`shared/types.ts:319`) with **no category field**. Return the flat list plus `themes`/`activeThemeId` rather than inventing categories by name-prefix guessing, which would be wrong the first time someone names a token `--color-spacing-hack`. |

**On `scamp_get_canvas_state`:** "all elements, all styles" on a real page is
easily tens of kilobytes, and it lands directly in the agent's context window.
Returning it by default trains agents to call the expensive tool first. Two
options: cap it with a documented element limit, or drop the tool and let
`get_element_tree` + targeted `get_element_by_id` cover the same ground. I
lean toward keeping it but capping, with the description saying so plainly —
flagged as an open question.

---

## Lifecycle, port, and discovery

**Port — the brief's fixed port is right, and my first draft of this plan was
wrong to replace it.** I originally recommended `allocateFreePort()` because
an ephemeral port cannot collide. That optimises the wrong thing. **The URL
the user registers with `claude mcp add` is stored in their agent's config,
not re-read at runtime** — so an ephemeral port means the registration is dead
the moment Scamp restarts, and the user has to re-run the command every single
session. A once-in-a-blue-moon port collision is a far smaller problem than
guaranteed daily breakage.

So: **try `39841` first, fall back to scanning the next 10**, exactly as the
brief says. Keep `allocateFreePort()` for the dev server, where nothing
registers the port.

**Decision 5 softens this but doesn't overturn it.** Since Scamp now rewrites
`.mcp.json` on every project open, a changed port would be re-registered
automatically — so stability is no longer load-bearing for *registration*. It
still matters for one case: an agent session **already running** when Scamp
restarts. Agents read their MCP config at session start, so a port that moved
leaves that live session pointing at nothing until the user restarts it. A
fixed port means the session just reconnects. Cheap insurance; keep it.

**Token stability follows the same logic** — generate once per project,
persist, reuse across launches.

**Start/stop.** Start when a project opens; stop on project close, window
close, and `before-quit`. On stop, rewrite `mcp.json` with a `"running": false`
rather than deleting it — the token must survive, and a stale-but-marked file
is more debuggable than a missing one.

**`.scamp/mcp.json`:**

```json
{
  "url": "http://127.0.0.1:39841/mcp",
  "token": "<stable per project>",
  "running": true,
  "started_at": "2026-08-05T10:00:00Z",
  "project": "my-portfolio"
}
```

---

## Phases

### Phase 0 — ✅ DONE. Findings below change Phase 2.

A throwaway server (`initialize` + `tools/list` + one `scamp_ping`) was built,
registered with real Claude Code 2.1.222, and driven end to end. Result:
**`✔ Connected`**, and `claude -p` discovered and called the tool, returning
its exact string. A hand-rolled server works.

Seven things the real client did that we would otherwise have guessed:

1. **It asked for `protocolVersion: "2025-11-25"`** — newer than any version
   I had hardcoded. The server answered with its own latest (`2025-06-18`)
   and **the client accepted and connected.** This is the single biggest
   de-risk for Decision 1: tolerant negotiation is real, not just specified,
   so our version constant going stale degrades to "still works" rather than
   "breaks." Had this failed, the SDK argument would have won.
2. **Subsequent requests carry `MCP-Protocol-Version: 2025-06-18`** — the
   *negotiated* version, echoed back, not the one it asked for. Do not
   validate this header against our latest; accept what we agreed to.
3. **It issues `GET /mcp` with `accept: text/event-stream`**, trying to open
   a server-initiated stream. Our 405 is correct and the client carries on
   without complaint — confirming we can skip SSE entirely.
4. **It sends no `Origin` header.** Decision 3's rejection rule doesn't block
   legitimate clients.
5. **`claude mcp add --header` forwards the token intact.** Decision 5 rests
   on this and it holds.
6. **`accept` arrives as `application/json, text/event-stream` — with a
   space.** An exact string match on the no-space form would have failed.
   Parse it, don't compare it.
7. **`39841` was free**, as the fixed-port choice assumed.

Also confirmed by curl: unknown method → `-32601`, unknown *tool* →
`isError` result (not a JSON-RPC error), notification → 202 with an empty
body, browser `Origin` → 403, missing token → 401.

The spike is throwaway and was not kept; the registrations it created have
been removed and the port released.

### Phase 0 — original brief (kept for reference)
A throwaway server: `initialize` + `tools/list` + one hardcoded
`scamp_ping` tool returning a fixed string. Register it with
`claude mcp add --transport http`, confirm `claude mcp list` reports
**Connected**, and call the tool from a real session.

This is the phase that de-risks everything else. Our own unit tests can only
prove we match *our reading* of the spec; watching a real client complete a
real handshake proves we match the client. If the shape is wrong, it surfaces
here for the cost of one file instead of after five phases of tool work. Worth
repeating against a second agent (Gemini CLI, Cursor) if you want the
"other agents" claim actually tested rather than assumed.

### Phase 1 — the snapshot, on demand
Promote `parseDeclarations` into `contextModel.ts` and add a `styles` map to
`ContextElement` (one derivation, three consumers — the same discipline
stories 1 and 2 established). Add `lib/canvasSnapshot.ts`: pure functions
turning store state into each tool's return shape. Full unit tests — it's
`renderer/lib`, so that's non-negotiable.

### Phase 2 — ✅ DONE
`src/main/mcp/jsonRpc.ts` (envelope, error codes, batch/notification parsing)
and `src/main/mcp/protocol.ts` (handshake, `tools/list`, `tools/call`,
version negotiation). Both pure and transport-free; both added to
`tsconfig.web.json`'s `include` per the `contextOps.ts` precedent.
47 unit tests.

**Verified against a real client, not just against the tests.** The shipped
`protocol.ts` was bundled into a throwaway HTTP shell and connected to real
Claude Code: `✔ Connected`, and `claude -p` called a tool through it and got
the exact string back. Phase 0's lesson was that unit tests only prove our
reading of the spec — this closes that gap for the real module.

Note the shims emit extensionless imports, which electron-vite resolves but
bare Node does not; the harness had to bundle with esbuild first. Irrelevant
to the app, but it will bite anyone else trying to run a shim directly.

### Phase 2 — original brief (kept for reference)
`src/main/mcp/jsonRpc.ts` (envelope parse/serialise, error codes) and
`src/main/mcp/protocol.ts` (dispatch: initialize / initialized / ping /
tools/list / tools/call). Both pure and directly testable — add them to
`tsconfig.web.json`'s `include`, per the `contextOps.ts` precedent. Tests
cover the handshake, unknown methods, malformed JSON, notification-vs-request,
and `isError` results vs JSON-RPC errors.

### Phase 3 — ✅ DONE
`src/main/mcp/tools.ts` (eight descriptors + the invoker),
`src/main/mcp/pendingQueries.ts` (correlation map + timeout, Electron-free so
it's directly testable), `answerSnapshotTool` in `canvasSnapshot.ts` (the pure
name→function mapping), `IPC.McpQuery` / `IPC.McpQueryResult` with typed args,
preload `onMcpQuery` / `sendMcpQueryResult`, and
`syncBridge/mcpResponder.ts` wired in as the store's third consumer.
35 new tests; 2200 passing overall.

Still to wire in Phase 4: nothing constructs the registry or the invoker yet —
they're pure factories waiting on a `BrowserWindow` and the HTTP server.

### Phase 3 — original brief (kept for reference)
`src/main/mcp/tools.ts` — the eight tool descriptors with JSON Schema
`inputSchema`, and dispatch to the pull-through query. New IPC channels
(`McpQuery`, `McpQueryResult`) in `shared/ipcChannels.ts`, typed args in
`shared/types.ts`, correlation map + timeout in main, renderer-side responder
wired next to the existing syncBridge subscription.

### Phase 4 — ✅ DONE
`src/main/mcp/server.ts` (Node `http`, loopback bind, `Origin` rejection,
token check, POST/GET/405, 1MB body cap, fixed port + forward scan),
`mcpOps.ts` (`.scamp/mcp.json`, stable per-project token), and
`lifecycle.ts` (the Electron glue — window ref, `ipcMain` reply listener,
registry, server). Wired: `initMcp(win)` beside `initWatcher`,
`startMcpForProject` beside both `watchProject` calls in `ipc/project.ts`,
`stopMcp()` in `performShutdownCleanup`. 28 integration tests; 2228 overall.

**Verified end to end against real Claude Code**: the real `server.ts` +
`protocol.ts` + `tools.ts` stack bound 39841, reported `✔ Connected`, and a
`claude -p` session listed all eight tools by name and called one
successfully.

`server.ts`, `mcpOps.ts`, `tools.ts`, `pendingQueries.ts`, `protocol.ts`, and
`jsonRpc.ts` are all Electron-free and unit-testable; `lifecycle.ts` is the
only file importing `electron`, which is what keeps that true.

### Phase 4 — original brief (kept for reference)
`src/main/mcp/server.ts` on Node `http`: bind `127.0.0.1`, `Origin` rejection,
token check, POST/GET/405 handling. `mcpOps.ts` for `.scamp/mcp.json`.
Registration and teardown in `main/index.ts`.

### Phase 5 — ✅ DONE
`src/main/mcp/agentConfig.ts` — target table, pure `mergeServerEntry`,
detection, `.gitignore` maintenance — wired into `startMcpForProject`, plus
`.mcp.json` added to both scaffolder `.gitignore` templates.
34 integration tests; 2262 overall.

**Four targets shipped, all schema-verified:** Claude Code `.mcp.json`
(verified live in Phase 0), Cursor `.cursor/mcp.json`, Gemini CLI
`.gemini/settings.json`, Kiro `.kiro/settings/mcp.json` (last three verified
against their docs this phase).

**Verifying rather than assuming paid for itself immediately.** Gemini CLI
takes **`httpUrl`**, not `url` — `url` there means an SSE endpoint. Shape A
was assumed uniform in the plan; it isn't. Writing `url` would have
registered a streamable-HTTP server as SSE and failed at connect time,
silently, for Gemini users only. There's now a test pinning it.

**Two targets still held**, for the reason the plan predicted:
- **VS Code** — the reachable docs describe the *extension-provider* API
  (`uri`), not the user `mcp.json` format, so the `uri`-vs-`url` question is
  unresolved. `.vscode/mcp.json` also permits comments, which the merge
  cannot preserve.
- **Codex** — TOML, and project-level support unconfirmed. A TOML writer that
  preserves an existing file is a different job from a JSON merge.

Both are additive; the Phase 6 copy button covers them meanwhile.

### Phase 5 — original brief (kept for reference)
`src/main/mcp/agentConfig.ts`: a **target table** (path, shape, detector) plus
three serialisers — shape A (JSON `mcpServers`), B (JSON `servers`), C (TOML).
Each target is read-merge-written so anything the user already had survives.
Claude Code's `.mcp.json` always; the rest only when that agent is detected.
Add every written path to `.gitignore` (and to both scaffolder templates).

Ship shape A first — it's four of the five agents and both verified schemas.
Shape B waits on confirming VS Code's top-level key; shape C waits on whether
Codex reads project-level config at all. Neither blocks the phase.

**Tests here matter more than anywhere else in this plan** — this is the only
code that writes outside `.scamp/`, and clobbering someone's MCP or editor
config is the one bug here that damages something Scamp doesn't own. Explicit
coverage: existing servers preserved, our key updated in place rather than
duplicated, malformed JSON left alone rather than overwritten, and no file
created for an undetected agent.

TOML is the one place I'd reconsider the no-dependencies stance — hand-rolling
a TOML *writer* that has to preserve a user's existing file is meaningfully
harder than the JSON case. If shape C proves fiddly, either take a small TOML
library for it alone or skip Codex and surface the copy button instead.

### Phase 6 — ✅ DONE
`McpStatusPill` in the terminal header (status + copy-command fallback,
`IPC.McpStatus`), the MCP section in both `agentMd.ts` variants,
`docs/notes/mcp-server.md` and `docs/notes/mcp-protocol.md`, and
`test/e2e/mcp-server.spec.ts`.

**12 e2e tests pass against a real Electron session** — this closes the gap
flagged after Phases 4 and 5. The spec speaks the real protocol over the real
socket exactly as an agent would: it draws a rectangle, calls
`scamp_get_selected_element`, and gets the live element back, proving the
main↔renderer seam. It also proves auto-registration (`.mcp.json` written
with the right URL and token), the gitignore entry, both access-control
rejections, and the terminal pill.

Two notes for whoever runs these next:
- **The e2e runs `out/main/index.js`, not the `.js` shims.** `npm run build`
  is required before the spec sees any main-process change — without it all
  12 fail against a stale bundle for reasons that look like product bugs.
- The `contextModel` change was re-checked against `context-file.spec.ts` and
  `copy-context.spec.ts` (11 tests, all passing).

### Phase 6 — original brief (kept for reference)
Terminal status line and copy button (question 7). MCP section in both
`agentMd.ts` variants, telling the agent the server exists and what it's for
— not how to connect, since it already is. `docs/notes/mcp-server.md` plus
`docs/notes/mcp-protocol.md` (your answer to question 1: what we implement,
what we skip, and why, so nobody re-derives it from the spec). Then the
integration test that drives a real handshake → `tools/list` → `tools/call`
against a started server — the only level that catches a transport-shape
mistake.

---

## Files to touch

**New:** `src/main/mcp/{jsonRpc,protocol,tools,server,agentConfig}.ts`,
`src/main/ipc/mcpOps.ts`, `src/renderer/lib/canvasSnapshot.ts`,
`src/renderer/src/syncBridge/mcpResponder.ts`,
`docs/notes/{mcp-server,mcp-protocol}.md`.

**Modified:** `src/renderer/lib/contextModel.ts` (promote `parseDeclarations`,
add `styles`), `src/renderer/lib/contextInline.ts` (use the promoted one),
`src/shared/ipcChannels.ts`, `src/shared/types.ts`,
`src/shared/templates/agentMd.ts`, `src/main/index.ts`,
`src/main/ipc/projectScaffold.ts` (`.mcp.json` in both `.gitignore`
templates), `src/renderer/src/syncBridge.ts`, the terminal panel component,
`tsconfig.web.json`.

**Shim regen:** this spans both sides — `tsc --build` for **both**
`tsconfig.web.json` and `tsconfig.node.json`, with the dev server stopped.

---

## Tests

- `test/canvasSnapshot.test.ts` — every tool's return shape, including the
  unhappy paths (no project, missing id, empty page, component editor open).
- `test/mcpJsonRpc.test.ts` — envelope handling, all error codes.
- `test/mcpProtocol.test.ts` — handshake, version negotiation, `tools/list`
  completeness (a test that fails when a tool is added without a schema),
  `tools/call` on an unknown tool name → `isError`, not `-32601`.
- `test/integration/mcpServer.integration.test.ts` — real server on a real
  port; full `initialize` → `tools/list` → `tools/call` sequence; `Origin`
  rejection; bad token; `GET` → 405.
- `test/integration/mcpAgentConfig.integration.test.ts` — the merge, against
  a real temp dir, **per shape**: no existing file → created; existing file
  with other servers → those survive and `scamp` is added; existing `scamp`
  key → updated in place, not duplicated; malformed JSON/TOML → left untouched
  and the failure reported rather than swallowed; undetected agent → no file
  and no directory created. Highest-consequence test in the set — it's the
  only code here that writes outside `.scamp/`.
- No new Playwright spec. Per your standing preference I'll add e2e only if
  the integration test leaves a real gap, and I don't think it will — there's
  no UI surface here.

---

## Open questions for review

**Status: all answered.** Recorded decisions, with your notes kept inline
below:

| # | Decision |
|---|---|
| 1 | **Hand-roll** the protocol. Write `docs/notes/mcp-protocol.md` explaining what we implement and what we deliberately skip — so the next person doesn't have to re-derive it from the spec. |
| 2 | **Pull-through.** |
| 3 | **Token, yes** — resolved by Decision 5: Scamp writes the config, so the user never types it. The friction you objected to no longer exists. |
| 4 | **Cap** `get_canvas_state`. |
| 5 | **Ship** `list_components` without variants. |
| 6 | **Flat** theme tokens. |
| 7 | **Terminal hint + copy button** — reframed by Decision 5; see the note under that question. |
| 8 | **Fixed port**, now insurance rather than load-bearing. Combined with Decision 5, the user registers **zero times**. |

Each question below says what was being chosen, what changes in the product,
and how expensive it is to change your mind later.

### 1. Hand-roll the protocol, or take the SDK? (Decision 1)

**What's being decided:** who maintains the ~200 lines of JSON-RPC and HTTP
plumbing between the agent and our tools.

| | Hand-roll (recommended) | `@modelcontextprotocol/sdk` |
|---|---|---|
| Code we write | ~200–250 lines in `src/main/mcp/` | ~30 lines of glue |
| New dependencies | none | 1 direct, **17 transitive** (express 5, hono, jose, ajv, zod, cors…) |
| Spec updates | we hand-edit a version constant and any changed handshake fields | arrive via `npm update` |
| Risk | subtle non-compliance that only some clients trip over | electron-vite has to bundle Express 5 into the **main** process; frameworks with dynamic `require`s are a known source of bundling pain |

**What the user experiences:** nothing, either way. Both produce a server that
connects. This is purely a maintenance and bundle-size bet.

**Why I lean hand-roll:** MCP has revised roughly twice a year, and each
revision has been additive with explicit version negotiation — a small server
that ignores the optional half is cheap to keep current. Pulling a JOSE/OAuth
stack and two schema validators into a desktop app to expose eight read-only
functions on localhost is a lot of surface for the problem.

**If you pick the SDK anyway,** the honest argument for it is that
correctness-by-dependency beats correctness-by-our-own-reading of a spec, and
Phase 0 is the only thing standing between us and a subtle bug. That's a
legitimate position.

**Reversibility:** better than I first wrote. The tool layer (Phases 1 and 3)
is transport-agnostic, so swapping is roughly a day's work on one module.
Decide before Phase 2 to avoid wasting that day, but it isn't a trapdoor.

okay lets handroll, but need to document this in notes

### 2. Pull-through, or push-and-cache? (Decision 2)

**What's being decided:** whether the agent's answer is *guaranteed* current,
or up to ~500 ms behind.

**The case that decides it** is the one the story was written for: the user
clicks an element, then immediately types "make this wider." With
push-and-cache, the push is still debounced when the agent queries, so the
agent confidently answers about the *previously* selected element. It doesn't
error — it's just wrong, and neither of you can tell. That failure mode is
worse than a visible one.

| | Pull-through (recommended) | Push-and-cache |
|---|---|---|
| Freshness | exact | up to the debounce, ~500 ms |
| Latency | one IPC round trip, sub-ms | instant |
| Failure mode | renderer doesn't answer in 2 s → `isError: "the Scamp canvas did not respond"` | silently stale answer |
| Cost | correlation map + timeout (~40 lines) | serialise the whole `elements` map on a debounce |

The pull-through failure is rare (renderer mid-heavy-drag, or paused in
DevTools) and, crucially, *visible* — the agent is told it didn't get an
answer instead of being handed a stale one.

**Reversibility:** easy. Same IPC channels, different resolution strategy.
Low-stakes, changeable any time.

OKay lets go with pull through.

### 3. Add a token, or rely on `Origin` alone? (Decision 3)

**What's being decided:** whether a web page the user happens to have open can
read their design.

Browsers attach an `Origin` header, so rejecting requests that carry one
blocks the casual case. A token additionally blocks *any* other local process
— another app, or something the user installed — from reading the canvas.

**What it costs the user:** one extra flag on a command they run once:

```bash
claude mcp add --transport http scamp "$(jq -r .url .scamp/mcp.json)" \
  --header "X-Scamp-Token: $(jq -r .token .scamp/mcp.json)"
```

The reason this is now cheap is the port/token stability fix above — with a
per-project persisted token, this command is run **once per project**, not
once per launch. Had the token rotated per launch it would have been a real
nuisance and I'd probably argue against it.

**What's at risk if we skip it:** read-only exposure of page structure, class
names, and theme tokens to local processes. Not credentials, not file writes.
Genuinely low — this is a "the fix is nearly free" argument, not a "this is
dangerous" one. Im not sure about this one because I dont want users to have to run extra commands, I want them to open their agent attach the MCP and just get to work. lets chat about this more.

### 4. Cap `scamp_get_canvas_state`, or drop it?

**What's being decided:** whether the agent has a tool that can flood its own
context window.

A page with ~100 elements, each carrying declarations plus custom properties,
serialises to tens of kilobytes — plausibly 10–30k tokens landing in the
agent's context in one call. Agents reach for the broadest tool first, so this
one will get called a lot.

- **Cap it (recommended):** return up to a documented element limit, then
  truncate with an explicit note telling the agent to use
  `get_element_by_id` for the rest. "Give me everything" is a legitimate
  opening move before a large refactor, and the cap keeps it from being an
  expensive mistake.
- **Drop it:** the agent composes `get_element_tree` (ids, tags, classes only
  — cheap) and then targeted `get_element_by_id` calls. More round trips,
  each one small. Nothing becomes impossible.

The deciding factor is that a truncated answer *that says it was truncated* is
strictly better than no tool, and better than an untruncated one.

yes cap it.

### 5. Ship `scamp_list_components` without variants, or hold it back?

**What's being decided:** whether the agent knows the project's components
exist at all, given `variants` only exists on an unmerged branch.

- **Ship without (recommended):** the agent gets each component's name and
  path, and can read the file directly for anything more. The tool's
  description must not mention variants — an agent told a field exists and
  finding it empty will conclude there are none.
- **Hold it back:** the agent has no way to discover components through MCP
  and falls back to guessing from the filesystem. Strictly worse than a
  partial answer.

**Reversibility:** completely additive. Adding `variants` later breaks no
existing agent behaviour — the tool gains a field.

we arent shipping variants for a while so we can ship without it.

### 6. Flat theme tokens, or the brief's grouped shape?

**What's being decided:** whether we report tokens as they exist on disk, or
invent a structure over them.

`ThemeToken` is `{name, value}` with no category (`shared/types.ts:319`).
Grouping into `{colors, typography, spacing}` means guessing from name
prefixes.

**Why flat wins, strongly:** the agent is about to *edit `theme.css`*. If our
tool describes a structure that file doesn't have, the agent's model of the
file diverges from the file — and it'll write edits against the wrong mental
shape. Prefix-guessing also breaks the first time someone names a token
unconventionally, and it breaks silently. Returning the flat list plus
`themes` and `activeThemeId` is both simpler and more truthful; an agent that
wants tokens grouped can group them itself. yeah lets go with your recommendation here.

### 7. How much help does the user get connecting?

**What's being decided:** how many users actually end up with this working.
A feature nobody connects to has shipped in name only.

- **Docs only (`agent.md`):** zero code. Realistically, most users never run
  the command, because they never hit the section at the moment they needed
  it.
- **Terminal hint (recommended):** when the integrated terminal opens on a
  project whose server is running, print one line with the exact command,
  token and all, ready to paste. Cheap, appears at the moment of relevance,
  no magic.
- **A button that copies the command:** same idea with less noise; costs a
  small piece of UI.
- **Scamp runs `claude mcp add` itself:** assumes the `claude` CLI is
  installed, assumes Claude Code specifically over the other agents this story
  is meant to serve, and writes to the user's config without being asked. I'd
  avoid it.

Recommendation: **print or copy the command, never execute it.** The stable
URL and token from the lifecycle fix are what make one-time registration
actually stick. I think a terminal hint and a button at the top of the terminal to copy the command would be good.

> **Reframed by Decision 5.** With `.mcp.json` written automatically, there is
> no command to copy for Claude Code — so keep both surfaces you asked for,
> but change what they say:
>
> - **Terminal hint:** state the *status*, not an instruction —
>   `Scamp MCP ready — your agent can query the live canvas (8 tools).`
>   That tells the user the capability exists, which is the real job; nobody
>   uses a tool they don't know they have. **Phase 0 adds a second job here:**
>   a project-scoped server sits at `⏸ Pending approval` until the user
>   approves it in an interactive `claude` session, so the hint must say so
>   the first time — otherwise the tools appear broken for no visible reason.
> - **Copy button:** still earns its place, for the agents we don't
>   auto-configure yet and for the user whose agent is already running and
>   needs a re-add. Copies the full `claude mcp add --transport http …
>   --header …` line, or the raw JSON block for a non-Claude agent.
>
> So: same two surfaces, one now informational and one a fallback, rather than
> both being the primary path.

### 8. NEW — confirm the fixed port (see Lifecycle)

**What's being decided:** whether the user re-runs `claude mcp add` once per
project, or once per app launch, forever.

I recommended `allocateFreePort()` in the first draft of this plan and was
wrong: `claude mcp add` writes the URL into the agent's **config file**, which
is not re-read at runtime. An ephemeral port therefore invalidates the
registration on every restart. The brief's fixed `39841` with a small fallback
scan gives a stable URL in the normal case and is the right call.

**The residual risk** is a port collision, which now surfaces as "the agent
connects to something that isn't Scamp." Worth handling explicitly: the
fallback scan should verify it actually bound rather than assuming, and the
`initialize` response's `serverInfo.name` identifies us as Scamp so a
misdirected client can tell.

Flagging it because it reverses a recommendation you may already have read.

I would like to have the user add the mcp as few times as possible.