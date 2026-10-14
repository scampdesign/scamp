# Framework phase 7 — full-stack in Scamp's UI — Plan

Status: **implemented on 2026-09-15** on `feat/framework-phase-7`,
stacked on phases 1, 3, and 5. Source: "Phase 7" of
`scamp-framework-tech-plan.md`. Needs `scampjs` 0.3.0 (contract 2).

## Goal

The backend is first-class in the app without the app becoming a
backend builder: routes listed, a route generated from a view's sample
data, the dev server's log in the app log, `.dev.vars` handled, agents
told.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Where routes show | A **Routes** section under Pages in the same sidebar section, scamp projects only | Views already live under Pages; routes sit beside what they render. |
| What the app edits | Only the `render` export, and a new file | The route file is the developer's; the app never regenerates it. |
| Opening a route | Read-only in the code panel, with a back control | The code panel is where code lives in the app; editing belongs to the editor or the agent. |
| Generate route | `load()` returns the view's samples, typed by inference; `client` with no-op handlers when the view has events; a commented Drizzle query with a recipe present | The plan's bridge: the design defines the shape, the backend fills it. |
| Request logs | `scamp dev --json`, parsed in main, pushed to the app log | One parser, and the preview window's own log stays readable. |
| `.dev.vars` | Keys in Settings, values never in the renderer; Open in the editor | Handled like `.scamp/`: local, private, out of snapshots. |
| agent.md | The app's template plus the recipe sections the file already carries | Consumes the framework's Database section instead of duplicating it. |
| MCP | `scamp_list_routes` answered from disk in main | Routes are files, not canvas state. |
| Preview | A view a static route renders previews at that route | The route's `load()` runs, which is the point of writing one. |
| Contract range | `0–2`, written `2` | scampjs 0.3 is contract 2; the per-file preservation keeps older files as they are. |

## What landed

- `src/main/ipc/routeOps.ts`, `routes.ts`: list, read, set render, write, `.dev.vars` keys.
- `src/main/devServer/devLog.ts` and the manager: `--json`, the app-log sink.
- `src/renderer/lib/generateRoute.ts`; `projectShell/useRoutes.ts`, `RoutesSection.tsx`; the code panel's route view; `routeSource` in the store.
- `ProjectSettingsPage`: the Environment section.
- `agentMd.ts`: routes and `.dev.vars` in the framework paragraph; `withRecipeSections`.
- `src/main/mcp`: `scamp_list_routes`.
- `SUPPORTED_CONTRACT` 0–2.
- Tests: unit for the generator and the parsers, integration on the contract-2 fixture, `test/e2e/routes/generate-route.spec.ts`.
- `docs/notes/routes-in-the-app.md`.

## Done when

- [x] A designer draws a view, clicks Generate route, and the route file appears with the samples in `load()`.
- [x] The preview runs the route and its request shows in the app log.
- [x] An agent can find every route through `scamp_list_routes` and the Routes section of `agent.md`, and replace the sample with a real query using the Database section the recipe wrote.
