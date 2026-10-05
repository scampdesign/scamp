# Importing a React app into Scamp

Split out of [`builtin-agent-plan.md`](builtin-agent-plan.md) on
2026-10-05. The Scamp Agent beta covers AI-assisted HTML import only;
React and existing-project import (SCMP-102) follows it, using the
pieces the beta builds.

This is a scoping document, not yet a build plan. The decisions at the
end come first.

---

## Where things stand

- **No code exists.** `src/main/ipc/projectMigrate.ts` migrates Scamp's
  own formats (legacy → Next.js → Scamp framework). Nothing reads a
  React codebase.
- **The only React import today is an agent doing it by hand**, through
  the MCP server: it reads the repo and writes views. The review of 60
  such screens found the result renders monochrome and can't be edited
  well — 6,339 undeclared-token findings, no `Show` or `Repeat`
  ([`../notes/agent-authored-views-review.md`](../notes/agent-authored-views-review.md)).
- **[`agent-bulk-import-plan.md`](agent-bulk-import-plan.md) is the fix
  for that path**, through agent.md and MCP changes: say the token rule
  depends on mode (authoring vs transcribing), make declaring tokens
  cheap, add `scamp_check_project`, and spell out what Scamp can't
  express. None of it is implemented.

## What the beta leaves behind to build on

| From the beta | Use here |
|---|---|
| Write tools that edit through the store | An agent transcribes into the model, not into files — round-trip by construction |
| `lintView` feedback on every write | Undeclared tokens and untyped values caught as they are written |
| Token mode (**Create theme tokens** / **Keep hex values**) | The same choice, at the start of a React import |
| The import cleanup skill and its eval | A second skill, `react-import`, with its own rubric |
| Pre-session snapshot and **Undo AI session** | A multi-view import undone in one click |

## Two ways to do it

**A. Render, then capture.** Run the app's dev server, visit each route
in the import window, and feed what renders through the existing HTML
capture and `reduceCapture`. The agent then maps the result back to the
source: repeated JSX becomes components, `.map()` becomes `Repeat`,
conditionals become `Show`.

- Reuses the importer, its fidelity harness, and everything the beta
  improves in it.
- Fidelity is measured, not inferred — the page is what the browser drew.
- Needs the app to run: dependencies installed, environment variables,
  a route list, and auth for anything behind a login.

**B. Read the source.** The agent reads components and styles and
writes views directly, as the MCP path does today, with the bulk-import
plan's fixes and the beta's write tools.

- Works on an app that won't run.
- Fidelity depends on the agent resolving CSS-in-JS, Tailwind and theme
  objects correctly, with nothing to check it against.

A hybrid is likely: **A** for what a view looks like, the source for
what its structure means (component boundaries, props, bindings).

## Decisions before this becomes a build plan

1. **Approach:** A, B, or the hybrid.
2. **What "existing project" covers:** importing views *from* a React
   app into a Scamp project, or adding Scamp *to* the React project in
   place (SCMP-102's title). These are different products.
3. **Order against the bulk-import plan:** its agent.md and MCP changes
   help external agents now and are cheap; whether they ship before, or
   are folded into, this work.
