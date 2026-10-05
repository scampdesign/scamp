# Scamp Agent (beta) — development plan

The build plan for [`../builtin-agent.md`](../builtin-agent.md), the
PRD for a built-in chat agent that runs on the user's own Claude key.

The PRD's shape holds up. Five of its assumptions don't match the
codebase, and two of those change what has to be built. Those come
first, because the phases depend on them.

---

## What the codebase changes about the PRD

**1. There are no write tools to reuse.** The PRD lists "update styles,
add element, edit component, update theme" as existing MCP tools. All 16
MCP tools are read-only (`src/main/mcp/tools.ts`). An external agent
changes the canvas by writing `.tsx`/`.module.css` files itself; chokidar
notices, the renderer reloads, and an `agent_edit` snapshot is taken.
The write tools are new work, and they are the biggest piece of this plan.

**2. Tokens: the PRD and the importer disagree.** The PRD's cleanup
targets say "pull repeated colors, spacing, and type values into theme
tokens." The importer did exactly that until commit `20ea369`, which
removed it: it produced a theme nobody chose, and two imported sites
collided in one project's palette
([`../notes/import-token-collisions.md`](../notes/import-token-collisions.md)).
The bulk-import plan settles on "transcribe literally; tokenising is the
user's call." **Decided:** the importer stays literal, and the user makes
the call when they start a cleanup: **Create theme tokens** or **Keep
hex values**. See *Token mode* under Phase 5.

**3. React / existing-project import doesn't exist.** SCMP-102 has no
code; `projectMigrate.ts` only moves Scamp's own formats. The bulk-import
plan for React repos is unimplemented. **Decided:** the beta's headline
is AI-assisted **HTML (URL)** import, and React import has its own plan,
[`react-import-plan.md`](react-import-plan.md), to follow the beta.

**4. One-click restore doesn't cover everything the agent changes.**
Snapshots capture page, view and component `.tsx`/`.module.css` only —
not `theme.css`, not `DESIGN.md`. A restore is two clicks (preview, then
**Restore**), and it clears the undo stack. A cleanup that adds tokens or
extracts a component would only half-undo. Phase 4 closes this.

**5. Import facts that are out of date in the PRD.** Capture runs in a
*visible* "Scamp — Import" window hosting a `<webview>`, not an
offscreen `BrowserWindow`. The import report shows in that window, not in
the main app. The original page source is kept in `os.tmpdir()` and
deleted when another project opens or the app quits — so cleanup has to
happen in the same session as the import.

Everything else the PRD needs has a foothold:

| PRD need | Exists today |
|---|---|
| Secure key storage | `src/main/auth/tokenStore.ts` — `safeStorage` to a `.bin` in userData, injectable for tests |
| Login gating | `src/main/auth/authService.ts`; `authStatus` / `onAuthChanged` in preload. No renderer store yet |
| Left sidebar section | `SidebarRail.tsx` + `SidebarSection` union in `canvasSlice.ts:258` + branch in `ProjectShell.tsx` |
| Read tools | 16 MCP tools; renderer answers through `mcp:query` → `mcpResponder.ts` |
| Store actions to drive | `patchElement`, `create*`, `deleteElement`, `reparentElement`, `reorderElement`, `groupElements`, `replaceSubtreeWithInstance`… in `store/canvas/slices/` |
| One undo step per turn | `beginHistoryTransaction` / `endHistoryTransaction` in `historySlice.ts` (per page, elements only) |
| Pre-session snapshot | `createSnapshot(projectPath, format, trigger, label)` in `snapshotOps.ts`, callable from main |
| Lint feedback for the agent | `lintView` — already the Checks section and `scamp_check_view` |
| `.scamp/agent-history/` | `.scamp/` is gitignored in every scaffold and ignored by the watcher |

---

## Architecture

```
renderer                              main
────────                              ────
AgentPanel ──agent:send──────────────▶ AgentSession (one per project)
   ▲                                     │  harness loop
   │◀──agent:event (stream) ─────────────┤  ├─ AnthropicProvider (SDK)
   │                                     │  ├─ tool catalog
agentToolResponder ◀──agent:tool────────┤  │   ├─ read  → canvasToolInvoker
   │  (store actions, lint)              │  │   └─ write → renderer, via agent:tool
   └──agent:tool-result─────────────────▶│  └─ confirmation gate
                                         ├─ providerKeyStore (safeStorage)
                                         └─ agentHistoryStore (.scamp/agent-history)
```

**Writes run in the renderer, through the store.** The agent never writes
a file. A write tool is executed by the renderer against the live store —
the same actions the properties panel calls — and the existing save path
(`storeSubscription` → `writeIfDirty` → `file:write`/`file:patch`) puts it
on disk. That gives the PRD's guarantees for free: every write is
produced by `generateCode`, so it round-trips through `parseCode` by
construction; it lands in history; and it can't race the save path the
way an external terminal agent can (which is why `agent-terminal` pausing
exists).

**Styles go in as CSS, through the parser.** The model writes CSS well
and Scamp's typed model badly. A style tool takes declarations —
`"display: flex; gap: 12px; border-bottom: 1px solid var(--color-border)"` —
and the renderer runs them through the same `applyDeclarations` /
`cssPropertyMap` path a file edit takes, then `patchElement`s the result.
The tool result reports back which declarations became typed
(panel-editable) and which fell to `customProperties`, plus any `lintView`
findings on that element. The model learns the panel's vocabulary from
the feedback rather than from a schema.

**The tool catalog is shared.** Both the MCP server and the harness get
the read tools from `canvasToolInvoker` (Phase 0). **Decided:** write
tools are registered for the built-in agent only, and the MCP server
stays read-only for the beta. Exposing them to external agents is a
later decision, alongside the bulk-import plan's open question about
`scamp_declare_tokens`.

---

## Claude API decisions

From the current API, not from memory:

- **SDK:** `@anthropic-ai/sdk` in the main process. It is the first AI
  dependency; streaming, typed errors and the tool loop are well past the
  "~20 lines" bar in CLAUDE.md.
- **Loop:** a hand-written loop over `client.messages.stream(...)`, not
  the beta Tool Runner. The loop has to pause mid-turn for user
  confirmation, take the snapshot before the first write, cancel on
  request, and stream every event to the panel — that is control flow
  the harness should own.
- **Model:** `claude-opus-5-5` (the PRD's open question). Adaptive
  thinking is always on; set `output_config.effort` explicitly — its
  default here is `medium`. Start at `medium` for chat edits and `high`
  for import cleanup, then tune per route against the eval (Phase 5).
  Store the model id in config so a picker can be added later.
- **Progress text:** `thinking: { type: "adaptive", display: "updates" }`
  (beta) returns short between-tool progress notes, which is exactly what
  the panel's "thinking" state should show.
- **Tools:** `strict: true` with `additionalProperties: false`, and
  `eager_input_streaming: true` on write tools so long CSS arrives as it
  is written. Validate every parsed input before executing — eager
  streaming hands back unvalidated JSON. `tool_choice` stays `auto`
  (forced tool use is a 400 on this model).
- **Caching:** tools and the system prompt never change within a session
  and go first with a cache breakpoint; the volatile canvas context goes
  in the user turn. Check `cache_read_input_tokens` is non-zero in a test.
- **History is append-only.** Thinking blocks are bound to the
  conversation, and editing earlier turns invalidates them. Persist the
  full `response.content` of every turn and never rewrite history. For
  long sessions, use server-side compaction rather than trimming.
- **Refusals and fallbacks:** check `stop_reason` before reading content;
  handle `refusal`, `max_tokens` and `pause_turn`. Enable server-side
  fallbacks (`fallbacks: "default"`, beta) — it is opt-in, and costs the
  user nothing unless a request is declined.
- **Errors:** map `AuthenticationError`, `RateLimitError` (honour
  `retry-after`), `APIConnectionError` and 5xx to plain-language panel
  states, using the SDK's typed classes, never message matching.
- **Cost visibility** (the PRD's open question): yes. Every response
  carries `usage`; show a per-exchange token count. It costs nothing to
  compute.

---

## Phases

Each phase ships something usable. The PRD's order is kept, with one
change: the harness and a minimal panel ship together, because a harness
nobody can talk to can't be tested by hand.

### Phase 0 — groundwork — **done**

- **The canvas-query bridge moved out of the MCP lifecycle** into
  `src/main/canvasQueries.ts`. The tool invoker was already free of the
  transport (`createToolInvoker(runQuery, options)`); what tied it to the
  MCP server was the query registry, created when the server started and
  dropped when it stopped or failed. The built-in agent would have gone
  down with a port collision on 39841. Now one long-lived registry serves
  both, and `canvasToolInvoker(projectPath)` hands either caller the read
  tools. No behaviour change for the MCP server.
- **`useAuthStore`** (`src/renderer/store/authSlice.ts`): `status` of
  `unknown | signed-in | signed-out`, seeded in `App` from `authStatus`
  and kept current by `onAuthChanged`. `unknown` until main answers, so
  a gated surface never flashes in. `AccountPanel` keeps its own state —
  it tracks the sign-in *flow*, and both read the same broadcast.
- **`@anthropic-ai/sdk`** added.

### Phase 1 — provider connection

- `src/main/agent/providerKeyStore.ts`, modelled on `tokenStore.ts`:
  `anthropic-key.bin` in userData, `memory-only` when encryption is
  unavailable, never plaintext. Unit tested with a fake `safeStorage`.
- IPC `agent:key-set` (validates with a one-token request before
  storing), `agent:key-status` (`connected | not-connected | invalid`),
  `agent:key-clear`. The renderer never receives the key — only status.
- An **AI provider** section on `SettingsPage.tsx`: paste field, where to
  get a key, status, disconnect. Hidden when signed out.

### Phase 2 — harness and a read-only chat

- `src/main/agent/`: `provider.ts` (the interface), `anthropicProvider.ts`,
  `harness.ts` (the loop), `session.ts` (one per open project; owns
  history, abort, the confirmation gate), `systemPrompt.ts`.
- The system prompt carries the PRD's conventions plus the project's
  `scamp_get_conventions` summary and `DESIGN.md` — not all of agent.md,
  which is 1,400+ lines in a real project.
- Read tools only. The agent can answer "what's on this page" and "why
  is this card not centred".
- A minimal **Agent** rail section (signed-in only): message list, input,
  streaming text, a stop button. `ControlOrMeta+Shift+A` in
  `useCanvasKeyboardShortcuts.ts`.
- Tests: the harness against a **fake provider** that replays scripted
  responses — tool calls, a `refusal`, a 429, a `max_tokens` stop. No
  network in CI. Lib tests for prompt assembly and history serialisation.

### Phase 3 — write tools

The core of the plan. Each tool is executed by
`src/renderer/src/syncBridge/agentToolResponder.ts` against the store,
inside one history transaction per agent turn.

| Tool | Does | Through |
|---|---|---|
| `scamp_set_styles` | CSS declarations onto an element, optionally at a breakpoint or state | `applyDeclarations` → `patchElement` (axis routing already exists) |
| `scamp_add_element` | A child of a given type and tag, with CSS and text | `create*` actions |
| `scamp_set_text` / `scamp_set_tag` / `scamp_set_attributes` | Content and semantics | existing slice actions |
| `scamp_move_element` | Reparent or reorder | `reparentElement` / `reorderElement` |
| `scamp_wrap_elements` | Group siblings in a new container | `groupElements` |
| `scamp_delete_element` | Remove, **always confirmed** | `deleteElement` |
| `scamp_extract_component` | A subtree into a component, and repeats into instances | `generateComponentFromSubtree` + `createComponent` + `replaceSubtreeWithInstance` |
| `scamp_set_theme_tokens` | Add or change tokens in `theme.css` | `theme:write` |
| `scamp_update_design_md` | One prose section of `DESIGN.md` | the design-md sync path |

Every result returns what changed in one line (the panel shows it as the
PRD's confirmation — "Updated rect_a1b2 — display: flex"), which
declarations didn't type, and the element's lint findings.

The `mcp:query` bridge has a 2-second timeout, sized for reads.
`agent:tool` gets its own channel and a longer one; component extraction
writes files.

Tests: each tool against a store fixture, asserting the generated files
round-trip (`generateCode` → `parseCode` reproduces the model).

### Phase 4 — safety

- **Pre-session snapshot**, taken in main before the first write of a
  session, labelled with the request. A session that only reads takes
  none.
- **Snapshots grow to cover the agent's reach:** `theme.css` and
  `DESIGN.md`, and a restore that removes a component folder the session
  created. Check how `restoreSnapshot` treats files that didn't exist at
  snapshot time before relying on it.
- **Undo AI session** in the Agent panel restores that snapshot in one
  click, with a confirm that names what it reverts. This is the PRD's
  "one click"; the History panel's two-click restore stays as it is.
- **The confirmation gate** lives in the harness. A destructive tool, or
  any turn whose writes touch more than ~5 elements, pauses the loop and
  sends `agent:confirm` with a summary; the tool result waits for
  **Apply** or **Cancel**. Cancel returns a `tool_result` saying the user
  declined, so the model can adjust rather than retry.
- Writes the user makes while a turn is applying: lock canvas editing
  during a write batch, and show it. Simpler than merging two writers.
- No tool reaches outside the project, and none makes network requests —
  the tool catalog has no file or fetch tool to misuse.

### Phase 5 — the import cleanup skill

There is no skill concept in the codebase yet. Define the smallest one
that is versioned and testable:

```
src/main/agent/skills/import-cleanup/
├── SKILL.md       instructions: cleanup targets, order, what to propose vs apply
├── tools.ts       the tool subset it may use
└── rubric.md      what "clean" means, for the eval
```

A skill is loaded into the system prompt when invoked, and narrows the
tool set. The cleanup targets, in the order the skill works them:

1. **Editability first** — the importer writes many per-side longhands
   (`side-not-typed` at 0.288 per element against 0.046 for agent-written
   views) and values the panel can't read. Fold them into the typed form.
   This is the cheapest, safest, most measurable win.
2. **Layout intent** — absolute placements the structure makes clear,
   into flex or grid.
3. **Semantic structure** — tags for what things are; collapse wrappers
   the deterministic pass couldn't.
4. **Components** — repeated structures, proposed with names.
5. **Tokens** — only in **Create theme tokens** mode (below).

Fidelity is the constraint on every step: the skill re-checks with the
same measurements the importer is tuned against.

**Token mode.** Starting a cleanup asks one question before the agent
reads anything, as two choices in the panel:

- **Create theme tokens** — the agent finds the colours, spacing and
  type values the page repeats, names them by role, and lists them in
  its plan (`--color-text: #1a1a1a`, used 42 times). Accepting the plan
  writes them to `theme.css` with `scamp_set_theme_tokens`, then
  rewrites the matching values to `var(--…)`. A token the project
  already declares with the same value is reused rather than duplicated,
  which is what stops two imported sites colliding.
- **Keep hex values** — literal values stay literal, matching the
  importer. The agent doesn't touch `theme.css`.

Both modes obey the one rule that holds everywhere: never reference a
token `theme.css` doesn't declare. The mode is a skill parameter that
changes which tools are in the skill's set (`scamp_set_theme_tokens` is
absent in **Keep hex values**), so the model can't drift out of it
mid-session. The choice is remembered per project as the next default.

Ordinary chat edits outside a cleanup follow the PRD's convention
instead: use an existing token when one matches, and never invent one
unasked.

**The eval** is the deliverable that makes the skill improvable. A corpus
of 6–10 captured pages, graded on:

- geometry and pixels against the source (`scripts/import-fidelity.mjs`,
  `scripts/import-pixels.mjs`) — must not regress;
- `lintView` findings per element — must fall;
- `parseCode` round-trip — must hold, every page;
- the rubric, judged by a model, for semantic tags and component choices.

Each page runs in both token modes. **Keep hex values** must leave
`theme.css` byte-identical; **Create theme tokens** must leave no
repeated literal the plan named, and no undeclared token.

Every eval run spends real money on a real key. Agree a budget before the
first run.

### Phase 6 — AI-assisted import

- A **Clean up with AI** option in the import window (signed in and
  connected only), and a **Clean up this import** suggested prompt on a
  view that was just imported. Both start with the token-mode choice.
- The import report moves its findings to the agent as context — they
  are the cleanup's to-do list.
- The flow: the skill reads the view, the findings and the original
  source (`scamp_get_import_source`); posts a plan in the panel as a card
  listing what it will change; the user accepts all or part of it; it
  applies through the write tools with the pre-session snapshot already
  taken.
- The deterministic importer is unchanged and works with no key
  connected.
- **The beta is HTML import only.** What the skill keeps having to fix
  is evidence for the deterministic importer: a cleanup step that fires
  on most pages becomes a candidate for a reduce pass, so every user
  benefits, key or not. Phase 5's eval measures both.

### Phase 7 — panel completeness

The PRD's remaining panel requirements, once the engine is proven:
per-page history in `.scamp/agent-history/<page>.json` (append-only, full
content blocks), the context line with an override, context-aware
suggested prompts, per-exchange token counts, and every error state in
plain language.

---

## Decisions

Made 2026-10-05:

1. **Tokens in cleanup:** the user picks **Create theme tokens** or
   **Keep hex values** when a cleanup starts (Phase 5, *Token mode*).
2. **React import:** out of the beta, in its own plan,
   [`react-import-plan.md`](react-import-plan.md). The beta is HTML
   import.
3. **Write tools over MCP:** built-in agent only for the beta.

Still open:

4. **Model and effort defaults:** `claude-opus-5-5` at `medium` / `high`
   is the starting point; the eval should decide the final numbers.

---

## Done when

The PRD's definition, plus the parts this plan makes explicit:

- A signed-in user connects a key in Settings and gets a first edit with
  no terminal.
- On a URL import, **Clean up with AI** asks for a token mode, produces
  a plan, applies the accepted parts, and the view round-trips through
  `parseCode` — in **Keep hex values** mode with `theme.css` untouched.
- On the eval corpus, cleanup lowers findings per element and doesn't
  regress geometry or pixels.
- **Undo AI session** restores pages, components, `theme.css` and
  `DESIGN.md` to their pre-session state in one click.
- Signed-out users see no trace of the agent.
