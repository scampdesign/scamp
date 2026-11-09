# Embedded Scamp — connecting an agent without an API key

Status: **A1 built** on `feat/embedded-reorder` (2026-11-09), ready for
manual testing. A2 waits on the policy answers; B is the goal.

Today Embedded Scamp's agent runs in Scamp, on the Anthropic API key the
user pastes in (`src/main/ipc/agent.ts`, `embeddedAgentProvider`). Many of
the people we want to reach aren't technical: they have Claude Code or
ChatGPT, not an API key, and making one is where they stop.

## What we can't do: "Sign in with Claude" or "with ChatGPT"

- **Claude.** Anthropic's Agent SDK documentation said that, unless
  previously approved, third-party developers may not offer claude.ai
  login or subscription rate limits for their products. Tools that did
  were blocked. Running Scamp's agent on a user's Pro or Max plan would be
  exactly that.
- **ChatGPT.** "Sign in with ChatGPT" works for OpenAI's own Codex. Whether
  a third-party app may use it is unconfirmed.
- **To do:** ask Anthropic and OpenAI directly, and record the answers
  here. Either answer could change the plan below. Until then, nothing in
  Scamp touches a user's Claude or ChatGPT credentials.

## A: use the agent the user already has (ship first)

The user's own Claude Code (or Codex, Gemini CLI, Cursor) does the work,
signed in however they already sign in. Scamp only offers the edits, over
the MCP server it already runs (`src/main/mcp/`), and already registers
itself in each agent's config (`agentConfig.ts`).

### A1: the agent pulls the queue (clearly allowed)

- A **Connect** step in the embedded window (setup screen and the Changes
  tab) writes the `scamp` MCP entry into the project's `.mcp.json` (and the
  other agents' configs), as Scamp projects already do. The entry is
  machine-local and added to `.git/info/exclude`, never committed.
- New MCP tools, answered by the embedded window rather than the canvas:
  - `scamp_embedded_get_edits`: the queued edits, as the same prompt
    `buildAgentPrompt` writes today (element, source line, scope, state,
    changes), plus the project's idiom rules.
  - `scamp_embedded_mark_done(ids, summary)`: the agent says which edits it
    wrote. Scamp clears them from the queue, refreshes git, and drops the
    page preview, as when its own agent finishes.
  - `scamp_embedded_get_selection`: what's selected on the page, for
    instructions like "make this match the header".
- The **agent setting** in the embedded window picks who works the queue:
  **Scamp Agent** (the API key, as today) or **My agent** (Claude Code and
  others). With My agent, the queue doesn't run itself: the Changes tab
  shows a line to paste into the user's agent once per session, such as
  "Do my Scamp edits, and keep checking for new ones."
- The setup screen's agent check passes with either choice, so a user with
  no API key can start.
- **Limit:** the user's agent acts only when prompted. A session asked to
  keep checking works, but it isn't the same as Scamp's continuous queue.
  Accept, discard, and the diff stay in Scamp, since they are git.

### A1 as built

- `src/main/embedded/ownAgent.ts`: the three tools
  (`scamp_embedded_wait_for_edits`, `scamp_embedded_done`,
  `scamp_embedded_get_selection`), the brief each batch comes with
  (Scamp's rules plus `buildAgentPrompt`), and the git snapshot that finds
  what the agent changed: a file counts when its content differs between
  the take and the done, so the user's own uncommitted edits elsewhere are
  never the agent's.
- `agentQueue.ts`: a worker setting. With `own`, nothing runs on a timer;
  `takeBatch` hands the queue over after the batching pause (a long wait,
  up to 50 seconds, so a session can keep listening without polling hard),
  one batch at a time. Pause holds it; Run now lets one batch through;
  Stop puts a taken batch back.
- `window.ts`: a server per session on its own ports (39861 and up, clear
  of the canvas's 39841), the token in `.scamp/mcp.json`, and the agents'
  configs written with `writeAgentConfigs`, skipping any the project
  tracks in git, and added to `.git/info/exclude`. The choice is kept in
  `embeddedAgent.json` in the app's data folder.
- The setup screen's agent check passes with My agent; the Changes tab's
  `AgentChoice` shows the connection, the line to paste, and the manual
  `claude mcp add` command when a config was skipped.
- A terminal under My agent (`AgentTerminal`, the app's `TerminalView`
  with the embedded preload), opened in the project's folder: main allows
  that window's folder as its terminal root (`allowTerminalRoot`), and
  only that window's. **Start Claude Code** types `claude`; **Paste the
  prompt** types the line. The Changes tab stays mounted (hidden) when
  another tab is open, so the agent's session survives a switch.
- Not in A1: design checks still need the Scamp Agent, and Accept still
  commits whole files (a user edit in a file the agent also changed goes
  with it), as with the Scamp Agent.

### A2: Scamp runs the user's CLI (needs the policy answer)

Scamp launches `claude -p "<the batch prompt>"` (or `codex exec`) in the
project folder for each batch, with the MCP config, and streams its
output into the agent status. That gives back the continuous queue with
no API key. It runs the user's installed CLI on their own login, but
it's Scamp's product driving their subscription, which is the case
Anthropic's rule describes. **Build only with written confirmation.**

## B: Scamp provides the agent (the goal)

The user signs in to Scamp, as they already do, and that's all. Scamp's
server runs the model with Scamp's own API key and charges for use.

- **Where it runs.** The agent loop stays in the desktop app (the file
  tools have to run there, next to the project). Only the model call moves:
  the app sends each request to a Scamp endpoint (on the website, beside
  `/api/desktop/*`), authenticated with the desktop session token, which
  forwards it to Anthropic and streams the answer back. The key never
  leaves the server. This slots in as one more `AgentProvider`.
- **Paying for it.** Credits or a plan, through the Stripe work (paused).
  Every request is metered on the server: input and output tokens, priced
  per model, written to a usage table per account.
- **Limits.** A monthly allowance per plan, a per-request cap, and a rate
  limit per account; the app shows what's left. Unverified accounts get
  none, as with cloud sync.
- **Abuse.** The endpoint takes only Scamp's own prompt shapes and tools
  (no arbitrary system prompts), so it can't be used as a free general
  proxy.
- **The flag.** Like Edit React Project, it ships to admins first.
- **Then:** the setup screen's agent check offers **Use Scamp's agent**
  first, with My agent and an API key as the alternatives.

## Order

1. A1, behind the existing Edit React Project flag.
2. Ask Anthropic and OpenAI. With a yes, A2 for Claude Code and Codex.
3. B, once Stripe is live: the provider endpoint and metering on the
   website, the provider in the app, then plans and limits.
