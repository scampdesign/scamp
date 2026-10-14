# Agent cost and live progress — plan

Status: **not started.** Collected from a review after React import
Phase 6. Each section is independent; pick them up in any order.

Two goals:

1. **Cost.** An API-key run of the built-in agent costs far more than the
   same work feels like in Claude Code. Part of that is billing: an API key
   pays per token, and a subscription doesn't show it. The rest is the
   harness, which we control.
2. **Progress.** Edits land on the canvas in bursts at the end of each
   model step, so a long run looks frozen and then changes all at once.

Related: `docs/archive/2026-10-06-builtin-agent-plan.md` (the harness, skills, confirm
policy), `docs/plans/react-import-plan.md` (batch import, Phase 6 skill).

---

## Where the cost comes from

Measured on the first Resova cleanup: **285k fresh input tokens + 3.1M
cache reads**, plus output and thinking.

| Driver | Why it adds up |
|---|---|
| History re-sent every step | `runTurn` (`src/main/agent/harness.ts`) loops: each tool round re-sends the whole conversation. Caching cuts re-reads to ~10% of input price, but a 40-step run re-reads the same tree 40 times. |
| Large tool results | `scamp_get_element_tree` on a 300–700 element view, `scamp_check_view` (~59 KB once). They stay in history and get re-read every later step. |
| Model and effort | `importCleanup` and `reactImport` skills run Opus 5.5 at `effort: 'high'` with adaptive thinking (`src/main/agent/skills/*.ts`). Thinking tokens bill as output ($20/M). |
| Ordinary chat | Same model and system prompt as skills, even for "make this blue". |

Prices used for estimates (Opus 5.5, per million tokens): $4 input, $20
output, $5 cache write, $0.20 cache read.

### Measure before and after every change

- `scripts/react-agent-eval.mjs` and the cleanup evals already print
  usage. Record tokens and dollars per route **and** the pixel score, so
  a cheaper run that does worse work shows up.
- `formatUsage` in the chat already reports "N tokens · M from cache"; add
  an estimated dollar figure next to it (C6) so testers see cost directly.
- Fix a baseline first: 5 riq routes + the Resova project, current
  settings. Budget ~$5 for the baseline.

---

## C1 — Shrink tool results (biggest win)

Large results cost on every later step, not just once.

- `scamp_get_element_tree`: default to an outline — id, tag, name, child
  count, and the few styles that matter for layout (`display`,
  `flex-direction`, size mode). Add `detail: 'full'` and a `rootId` /
  `depth` argument so the model asks for one subtree in full when it
  needs it.
- `scamp_check_view`: return the findings and the worst N regions, not
  the full diff. Keep a `detail` flag for the rest.
- Collapse repeated siblings in the outline: "12 × `row_…` (same shape as
  `row_a1b2`)".
- Tools: `src/main/mcp/tools.ts`, answered in
  `src/renderer/src/syncBridge/mcpResponder.ts`. MCP clients get the same
  smaller default, which also helps external agents.

**Done when:** median tool-result size on the eval routes drops by at
least half, and pixel scores hold.

## C2 — Drop stale tool results from history

A tree read 20 steps ago is out of date anyway, since the agent has edited
it since.

- Before each request, replace tool results older than the last K rounds
  (or superseded by a newer read of the same view) with a one-line stub:
  "[element tree for Home — replaced by a later read]".
- Keep the edit tools' short results; only stub reads.
- Check this doesn't break the cache too often: edits to early messages
  invalidate the cached prefix. Stub in blocks (for example every 10
  steps) so the prefix changes rarely, and measure cache-read vs.
  cache-write tokens before and after.
- Code: `harness.ts`, before the provider call.

## C3 — Match effort and model to the job

- Add a `model` field to the skill definition (`skills/skill.ts`), beside
  `effort`.
- Try `effort: 'medium'` for the cleanup skill, and Sonnet 5.5 for the
  cleanup and React import skills. Run the evals for each combination
  and keep the cheapest that holds the pixel score.
- Ordinary chat: default to a cheaper model and medium effort; offer
  "Use the most capable model" in agent settings for people who want it.
- Simple routes in a React batch (few elements, no lists) can run at low
  effort.

## C4 — Fewer steps per job

- Batch edits: let `scamp_set_styles` take several element ids, so a
  "fix all borders" pass is one call, not twenty.
- Skill instructions: read the tree once per view, plan, then edit — no
  re-reading the tree after every edit.
- Lower the step limit for chat (it's sized for skills now).

## C5 — Compact long runs

When history passes a threshold, summarise everything before the last few
rounds into one message ("views done, what changed, what's left") and
continue from there. Check the current API for server-side context
management before building our own. Use the `claude-api` skill for the
current shape, and don't rely on memory.

## C6 — Show the cost

- Estimated dollars per turn and per conversation in the chat footer
  (`formatUsage`), from the usage the provider already returns.
- A per-run cap in agent settings ("stop after $2"), which ends the turn
  cleanly with the history kept so the user can continue.

---

## Live progress on the canvas

### Why edits arrive in bursts

Each edit does reach the store the moment it runs. The bursts come from
`runTurn`:

1. It waits for the model's **whole** streamed response.
2. It calls `options.review(...)` with every tool call
   (`confirmPolicy.ts`: anything in `ALWAYS_CONFIRM`, or more than
   `BATCH_LIMIT = 5` edits, asks the user).
3. It runs every call at once with `Promise.all`.

So 20 edits from one response land in the same instant.

## P1 — Run each edit as its call finishes streaming

The write tools already have eager input streaming on, so each
`tool_use` block's input is complete before the message ends.

- In `harness.ts`, start a tool as soon as its `content_block_stop`
  arrives. Validate its input against the schema first, since a tolerant
  parser can return a truncated input.
- Keep all results in **one** user message at the end (the existing
  comment: splitting them teaches the model to stop calling tools in
  parallel).
- Keep running order the same as call order, for edits that depend on
  each other (add, then style the new element). Queue them, don't run in
  parallel.
- On `refusal` or `max_tokens`, calls that already ran stay; the
  unfinished one is dropped, and the history still gets a result for
  every `tool_use` it keeps.

**The confirmation conflict.** The review step needs the whole batch to
decide. Options, in order of preference:

- In a skill with an approved plan (`planApproved`), skip the batch
  review and stream edits. The user already agreed to the work, and
  Undo AI session covers it.
- In chat, confirm by kind instead of count: ask before the first
  `ALWAYS_CONFIRM` call (delete, theme changes) when it streams in, and
  stream everything else.
- Keep today's behaviour behind a setting for people who want to see
  everything first.

Update `docs/notes/` (agent harness note) with the new ordering rules.

## P2 — Show where the agent is working

Even with P1, edits can be fast. Make each one visible:

- Briefly outline or flash the element an edit touched (a short
  accent-colour ring that fades), drawn by the selection overlay layer.
- If the element is off-screen, scroll it into view, unless the user has
  moved the canvas during the run (then leave the viewport alone).
- A small "Editing `card_3f1a`…" line in the chat's running tool card.

## P3 — Pace skills so work arrives in waves

Tell the cleanup and React import skills to work section by section
(header, sidebar, main), finishing one before reading the next. Users see
regions settle one at a time. It costs nothing extra and fits C4.

## P4 — React batch import: show views as they land

Today the batch opens a view only at the end, because the component pass
rewrites views after the last page (`useImportBatch.ts`,
`useWebsiteImport.ts`).

- Write each view as soon as its page is captured and reduced, and show
  it in the project window: a live list of finished pages, and open the
  first one.
- After the last page, the component and repeat passes rewrite the views
  in place. The canvas reloads them like any external edit.
- Keep the whole batch a single undo step.

## P5 — External agents over MCP

Each file save already reloads the canvas, so progress depends on how
often the external agent saves. Add a line to the conventions
(`get_conventions`): "save one view or component at a time, not
everything at the end."

---

## Later decision: write tools over MCP

MCP is read-only by the agent plan's decision 3. External agents edit
files directly and skip the built-in agent's safety net (round-trip
check, one undo step per turn, confirmations, Undo AI session). If the
built-in edit tools are exposed over MCP, they need the same guards. Not
part of this plan, but C1's smaller tool results help external agents
either way.

## Suggested order

1. Baseline measurement.
2. C1 and C6: biggest saving, plus visibility.
3. P1 + P2: the biggest visible change for users.
4. C3: try cheaper models and effort, judged by the evals.
5. C2, C4, P3, P4, P5, C5 as needed.
