# PRD: Scamp Agent (Beta) — built-in AI chat with bring-your-own provider

**Status:** Draft
**Author:** Angie Hemans
**Date:** 2026-10-05
**Project:** Scamp Desktop
**Related:** SCMP-64 (Scamp Agent vision), SCMP-51 (HTML import from URL), SCMP-52 (Figma import), SCMP-102 (add Scamp to an existing project)

---

## Summary

Ship the first in-product AI in Scamp: a chat panel in the left sidebar where a user talks to an agent that reads and edits their canvas directly, so they never have to open a terminal or set up their own coding agent.

This is the **beta** of the Scamp Agent. It is scoped down from the full vision in SCMP-64 in three deliberate ways:

1. **Bring your own provider.** The user signs into their own AI provider (Claude first) and the agent runs on their key. Scamp does not host or resell a model in this phase.
2. **Left sidebar, not a right drawer.** The chat lives on the left, as a persistent panel the user works alongside.
3. **One flagship capability: AI-assisted import.** The first thing the agent is genuinely good at is driving the website and React importer to produce clean, faithful Scamp projects, not just general "edit my canvas" requests.

Everything else from SCMP-64 (Scamp-hosted API, Pro gating on token usage, native-app generation) stays out of the beta and is sequenced after it.

**Ownership and sequencing:** this beta is a **precursor to SCMP-64**. Angie builds and ships this slice, then hands off to Vivek for the more advanced AI features in SCMP-64 (Scamp-hosted model, deeper agent capabilities). SCMP-64 stays as the advanced follow-on and is blocked by this beta.

---

## Background

We already ship the passive AI integration: the `.scamp/context.md` context file, the Copy context button, and a local MCP server that a user's own terminal agent connects to. That path works, but it assumes the user is comfortable running an agent in a terminal and managing a separate AI account. Most designers are not.

SCMP-64 describes the end state: an agent brought fully inside the product, running on Scamp's own API connection, with no setup and no user key. That is the right long-term shape, but it carries dependencies we do not want to block the first release on: a billing relationship, token metering, abuse controls, and cost exposure on every free interaction. Since we are not going to provide our own model for a long time, the fastest honest path to in-product AI is to let users bring their own provider key.

This PRD defines that first shippable slice.

---

## Goals

- A non-terminal user can get AI help inside Scamp with no external agent setup.
- The user connects their own AI provider once, and the key is stored securely and never exposed to the renderer.
- The agent can read canvas context (active page, selection, element tree, theme tokens, components) and apply edits that round-trip through `parseCode`.
- The agent meaningfully improves the import flow: imported sites and React apps come in cleaner and more faithful to the source than a raw import, with less manual cleanup.
- Every agent change is reversible in one click.

## Non-goals (this phase)

- Scamp-hosted model / Scamp's own API connection (deferred; stays the SCMP-64 end state).
- Billing, token metering, or usage limits. The user pays their provider directly, so there is nothing for us to meter in beta.
- Multi-provider parity. Claude is the only officially supported provider at launch; the connection layer is built to add others later.
- Native-app generation (SCMP-73 and the translation skills) and any agent write that leaves the project folder.
- Full freeform "build me a whole app" agent sessions. The beta is scoped to canvas edits and import cleanup.

---

## Scope decisions and how they differ from SCMP-64

| Dimension | SCMP-64 (vision) | Beta (this PRD) |
|---|---|---|
| Model source | Scamp's own Anthropic connection, no user key | Bring your own provider key (Claude first) |
| Panel location | Right-side drawer next to properties | Left sidebar, persistent |
| Tiering | Pro feature, free users prompted to upgrade | Login-gated only; free with your own key; not advertised to logged-out users during testing |
| Cost model | Scamp absorbs token cost within Pro economics | User pays their provider directly |
| Headline capability | General canvas editing | AI-assisted import (sites + React apps) |

These are intentional. When the beta graduates, we revisit SCMP-64's Pro/hosted model as a separate decision, and the BYO-key path can stay as a power-user option even after we host a model.

---

## Users and the core flow

**Primary user:** a designer who wants AI help but does not use a terminal and does not want to wire up their own coding agent.

**Core loop:**

1. User connects their Claude account/API key once in settings.
2. User opens the Agent panel on the left sidebar.
3. User types a request in plain language, or starts an import and asks the agent to clean it up.
4. The agent reads canvas context, explains what it will do, and applies edits live through the existing IPC write path.
5. The canvas updates as files are written; the user can undo the whole session in one click.

---

## Feature 1: Provider connection (bring your own AI)

**What it does:** lets the user connect their own Claude account so the agent can run on their key.

Requirements:

- A "Connect AI provider" flow in Settings. Claude is the only provider at launch, presented as the default.
- The user pastes an API key (Anthropic). Inline instructions explain where to generate one.
- The key is stored with Electron `safeStorage` (the same secure-storage approach used for the Figma personal access token in SCMP-52), never written in plaintext, never exposed to the renderer.
- All provider calls are made from the Electron main process. The renderer only ever sends the prompt and receives streamed results over IPC.
- A connection test on save confirms the key works and surfaces a clear error if it does not.
- A visible connection status (connected / not connected / invalid) and a disconnect action that clears stored credentials.
- Model selection is fixed to a sensible default for beta (a current Claude model); no model picker in the UI yet, but the stored config leaves room for one.

Out of scope: OAuth-based provider login, multiple simultaneous providers, and per-project keys. One key per installation for beta.

---

## Feature 2: Chat panel (left sidebar)

**What it does:** the surface where the user talks to the agent.

Requirements:

- **Login-gated.** The panel and its toggle are only present for logged-in users. Logged-out users see no Agent entry point at all during testing (no teaser, no upsell).
- A persistent panel on the **left** sidebar, toggled by an "Agent" button and a keyboard shortcut (use `ControlOrMeta`-based binding so it is correct on macOS and Linux).
- Multi-turn conversation with full history visible in the panel.
- Responses and edits **stream in**: the user sees the explanation appear and each change confirmation as edits are applied, with the canvas updating live via file watching.
- Each applied change shows a short, specific confirmation (for example, "Updated rect_a1b2 — display: flex").
- A context summary line shows what the agent is focused on (active page / selected element) with an affordance to override it.
- Context-aware suggested prompts when the conversation is empty, differing by whether an element is selected and whether the current page was just imported.
- Per-page conversation history, persisted under `.scamp/agent-history/[page].json` and gitignored.
- Clear in-panel states for: not connected (links to the connect flow), thinking, streaming, applying edits, and error (including provider rate-limit and auth errors surfaced in plain language).

---

## Feature 3: Agent harness (engine)

**What it does:** connects the user's provider to the canvas through a tool-use loop, reusing the MCP tools we already built.

Requirements:

- A native agent harness in the Electron main process. The loop: assemble context from the MCP tools → send to the provider with tool definitions and full history → model returns text and/or tool calls → execute tools → return results → continue → stream to the panel.
- Tools are the existing MCP tools expressed as the provider's tool-use schemas:
  - **Read:** active page, selected element, element tree, theme tokens, components.
  - **Write:** update styles, add element, edit component, update theme / `design.md`.
  - **Import (new for beta, see Feature 4):** trigger an import, read the raw import result, and refine it.
- **All writes go through the existing IPC channels** (the same path canvas edits use). The agent never writes to disk directly, so every change is atomic and round-trips through `parseCode`. Channel names come from `src/shared/ipcChannels.ts`, never hardcoded.
- The harness is provider-abstracted behind a thin interface so a second provider can be added later without rewriting the loop.

**System prompt bakes in Scamp conventions:**

- Always use theme tokens (`var(--token)`) instead of a raw hex value when a token exists.
- Never remove `data-scamp-id` (or `data-scamp-instance-id`) attributes.
- No inline styles. CSS Module classes only.
- Only modify properties explicitly requested (minimal edits).
- Follow `agent.md` and `design.md`.
- Confirm each change with a short specific message, and ask one clarifying question when intent is ambiguous.

---

## Feature 4: AI-assisted import (the beta's headline)

**What it does:** the agent drives and cleans up the importer (SCMP-51 URL import, and React/existing-project import per SCMP-102) so the result is a clean Scamp project faithful to the source design, instead of a raw best-effort dump the user has to fix by hand.

**Why this first:** import is where a raw mechanical result is noticeably rough. SCMP-51 already produces a structural and visual import by rendering the page in an offscreen `BrowserWindow` and resolving computed styles. That is a solid starting point but not a clean Scamp project. The agent is the layer that turns "it came in" into "it came in clean." It is also a bounded, demoable, high-value task, which makes it a better beta anchor than open-ended canvas editing.

**What "clean and faithful" means (the agent's cleanup targets):**

- **Faithful to the design.** Visual result matches the source closely: layout, spacing, type, color.
- **Semantic structure.** Collapse redundant wrapper nesting the source used for its own reasons; choose meaningful tags (nav, header, section, button) rather than a wall of divs.
- **Theme tokens.** Pull repeated colors, spacing, and type values into theme tokens and reference `var(--token)` instead of scattering raw hex and pixel values.
- **Components.** Detect repeated structures (cards, list items, nav links) and propose extracting them into reusable Scamp components rather than duplicated element trees.
- **Layout intent.** Prefer flex/grid that expresses the real layout over absolute positioning where the source made the structure clear.
- **Round-trip clean.** Output must round-trip through `parseCode` before the page opens, same invariant as the base importer.

**Flow:**

1. User starts an import (URL, or points Scamp at an existing React/Next.js project) and opts into "clean up with AI," or runs the raw import and then asks the agent to clean it afterward.
2. The agent reads the raw import result as canvas context.
3. The agent proposes a cleanup plan in the chat (what it will consolidate, which tokens it will create, which components it will extract) before making large changes.
4. The user accepts, and the agent applies edits live through the normal IPC write path, each change confirmed in the panel.
5. The user can undo the whole cleanup session in one click (see Safety).

**Where the cleanup logic lives (decided):** import cleanup is a dedicated **Scamp-authored agent skill**, not just system-prompt behavior. A skill is more durable and testable, keeps the cleanup rules versioned in one place, and mirrors the native-translation-skill pattern in SCMP-73. The skill encodes the cleanup targets above (semantic structure, theme tokens, component extraction, layout intent, round-trip) and is the thing we iterate on as import quality improves.

**Interaction with existing import tickets:** the raw import pipelines (SCMP-51, SCMP-52, SCMP-102) stay responsible for fetching and producing a first-pass ElementTree. This feature adds an agent cleanup pass on top, driven by the cleanup skill. It does not replace the deterministic importer, and the deterministic importer must still work without AI connected.

---

## Safety

- A **pre-session snapshot** is taken before the first write of any agent session, so the user can restore the pre-session state in one click from the history panel. This matters most for import cleanup, which touches many elements at once.
- For operations affecting more than roughly 5 elements, the agent summarizes and asks for confirmation before writing. Import cleanup always goes through a plan-and-confirm step.
- The agent cannot delete pages or components without explicit confirmation, cannot rename without the confirmation flow, cannot access files outside the project, and cannot make network requests on the user's behalf beyond the provider API call and the import fetch the user initiated.
- Provider errors (auth, rate limit, network) are surfaced in plain language and never leave the project in a half-written state, since all writes are atomic through IPC.

---

## Gating and economics (beta)

**Gating: login only.** The one piece of gating in the beta is that the Agent is behind the Electron app login. Only users who have logged in can see and use it. This is a testing posture: we want to run it with a controlled set of logged-in users first.

- Logged-out users do not see the Agent and are **not** prompted or advertised to during testing.
- We will add discovery and promotion for logged-out users later, once the beta is stable. Not at first.
- There is no Pro gate, token metering, or usage cap in the beta.

**Economics.** Because the user runs on their own provider key, Scamp has no per-interaction cost and nothing to meter. Provider cost is the user's direct relationship with their provider.

This is explicitly a beta posture. When we later host a model (the SCMP-64 end state, owned by Vivek), tiering and token economics become a separate decision, and the BYO-key path can remain as a no-markup option for users who prefer it.

---

## Success metrics

- A user can connect a provider and get a first successful agent edit in under a few minutes, with no terminal.
- Import cleanup measurably reduces manual post-import editing (track edits made after an AI-cleaned import vs a raw import).
- Agent edits round-trip through `parseCode` with zero corruption across a test corpus of imports and canvas edits.
- Qualitative: imported projects are judged "clean" (token usage, component extraction, semantic tags) by review against a rubric.

---

## Open questions

- **Provider auth shape:** API key paste for beta is simplest. Is OAuth-style "Sign in with Claude" worth it before GA, or is key paste fine for the beta audience?
- **Model default:** which Claude model is the right default for cost/quality in the user's own account, given they pay for it?
- **Import cleanup aggressiveness:** how much should the agent restructure by default vs ask first? Leaning toward: visual fidelity always preserved, structural changes always proposed before applied.
- **History and cost visibility:** should the panel show the user an approximate token count per exchange so they understand what they are spending on their own key, even though we do not meter it?

---

## Phasing

1. Provider connection + secure key storage + connection test.
2. Agent harness in main process reusing MCP tools, with the Scamp-conventions system prompt.
3. Left sidebar chat panel (login-gated) with streaming, change confirmations, per-page history.
4. Pre-session snapshot + confirmation flows (safety).
5. Import cleanup agent skill: the Scamp-authored skill encoding the cleanup rules.
6. AI-assisted import flow: wire the skill and harness to the raw importer output, plan-and-confirm, round-trip validation.

Steps 1 through 4 are the general agent. Steps 5 and 6 are the headline capability and the thing the beta is pitched on.

This whole sequence is Angie's to build. On completion it hands off to Vivek for the advanced AI work in SCMP-64.

---

## Done when

A user can connect their own Claude account, open the Agent panel on the left, run an import of a website or React app, and have the agent clean it into a faithful Scamp project (theme tokens, extracted components, semantic structure) that round-trips through `parseCode`, with a one-click restore to the pre-session state, all without a terminal or a Scamp-hosted model.