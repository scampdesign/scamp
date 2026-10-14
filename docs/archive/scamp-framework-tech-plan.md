# Scamp framework — technical plan, by phase and by repo

Status: **plan, nothing built.** Companion to
`scamp-framework-plan.md`, which holds the reasoning and the decisions.
This document turns it into an order of work. Every phase is tagged
with the repository it lands in:

- **[framework]** — the new `scampjs` repository, publishing
  `scampjs` and `create-scampjs` to npm. MIT.
- **[app]** — this repository, the Electron app.

The two repos share one contract (files, CLI, templates, compatibility
range — see "Repositories and packaging" in the framework plan). Each
phase below says which contract version it produces or consumes, so the
repos can move at different speeds without guessing.

The framework repository is `scampdesign/scampjs`; its `CONTRACT.md` is
the home of the contract between the two repos. Package names were
settled there on 2026-09-10: `scampjs`, `create-scampjs`, and
`@scampjs/adapter-*` (the `@scamp` scope is held by another npm user).

## The order, in one table

| # | Phase | Repo | Depends on | Ships to users as |
|---|---|---|---|---|
| 0 | Bootstrap the framework repo | framework | — | nothing yet |
| 1 | Views and bindings on today's Next output | app | — | a Scamp release: Data tab grows, `views/` appears, projects still run on Next |
| 2 | `scamp dev` | framework | 0, contract from 1 | `scampjs` 0.1 (dev server only) |
| 3 | Preview through `scamp dev` | app | 2 | a Scamp release: previews start in under a second |
| 4 | `scamp build`, rendering modes, islands, `create-scampjs` | framework | 2 | `scampjs` 0.2, `create-scampjs` |
| 5 | New projects on the Scamp structure; Next migration | app | 3, 4 | a Scamp release: the format switch |
| 6 | API routes, the Drizzle recipe, the Cloudflare adapter | framework | 4 | `scampjs` 0.3, `@scampjs/adapter-cloudflare` |
| 7 | Full-stack in Scamp's UI | app | 5, 6 | a Scamp release: Routes list, Generate route, request logs |
| 8 | Further adapters | framework | 6 | `@scampjs/adapter-node`, `-vercel`, `-netlify` |

Phases 0 and 1 run in parallel. So do 2 and the tail of 1, 4 and 3,
6 and 5. The app never blocks on the framework for more than one phase,
and the framework never needs the app to be released first.

## Phase 0 — bootstrap the framework repo [framework]

Goal: a publishable, empty package with the contract written down.

- Claim the `@scampjs` npm org and the `create-scampjs` name. Create the
  `scampjs` repository, MIT license.
- Repo layout: `packages/framework` (`scampjs`),
  `packages/create-scampjs`, `packages/adapter-*` later; npm workspaces.
  Plain Node + TypeScript + Vitest; no Electron anywhere.
- `CONTRACT.md` at the root: the file contract (`views/`, `routes/`,
  `components/`, `design/theme.css`, the binding grammar, the `_scamp`
  view metadata, the render-mode export), the CLI contract (readiness
  line, `/_views/<Name>`, request-log format), and the templates
  export. Version it: `contract: 0` until phase 2 ships `1`.
- The `Env` and `LoadContext` types, exported from `scampjs/runtime`
  even before anything runs, so phase 1's `agent.md` can point at them.
- CI: lint, typecheck, unit tests, and a dry-run publish on tags.
- Done when: `npm publish --dry-run` succeeds and `CONTRACT.md` matches
  what phase 1 generates.

## Phase 1 — views and bindings on today's Next output [app]

Goal: prove the binding model where projects already are. Next stays
the runtime and the preview. A project without `routes/` keeps working
through the existing `app/<name>/page.tsx` wrapper.

### Model

- `src/renderer/lib/element/types.ts`: `ScampElement` gains
  `bind?: Record<string, string>` (attribute → prop),
  `on?: Record<string, string>` (event → prop),
  `repeat?: { over: string; as: string; key?: string }`, and
  `showIf?: string`. Text keeps its existing `prop`.
- Sample data: prop defaults extend from strings to booleans and arrays
  of flat records. A `SampleValue` union and a `samples` map on the
  view root, edited by the Data tab.
- Props-type inference in `src/renderer/lib/` (new `viewProps.ts`):
  `string` for text and attribute props, `boolean` for show and boolean
  attributes, `Array<{…}>` from the sample rows (number when every
  sample parses), `() => void` / `(key: string) => void` for handlers.
  Pure, fully tested.

### Generator and parser

- `generateCode/tsx.ts`: emit `{list.map((row) => (…))}` around a
  repeated subtree, `{row.field}` text refs inside it, `attr={prop}`,
  `onX={prop}` (and `onX={() => prop?.(row.key)}` inside a repeat),
  `{flag && (…)}`, the inferred props type with defaults, and the
  `className` passthrough views share with components. Canonical forms
  only.
- `parseCode/tsx.ts`: read exactly those forms back. Anything outside
  the grammar is preserved verbatim, as today. The round-trip invariant
  test extends to every binding kind.
- `generateCode/css.ts` and `parseCode/css.ts`: unchanged.

### Canvas

- A path evaluator over sample values (`lib/bindingEval.ts`): prop
  names and member paths only, no expressions. `ElementRenderer`
  resolves text and attributes through it before render, renders a
  repeated subtree once per sample row, and skips a subtree whose
  `showIf` sample is false. No user code runs in the canvas.
- Parity fixtures for each binding kind, so the canvas render is
  proven against a browser render of the generated file.

### Data tab

- `DataPanel.tsx` gains the four row kinds — Attributes, Events,
  Repeat (with the inline sample-rows table), Show — under the same
  sample-equals-default rule. Element right-click gains **Repeat
  this…** and **Show only when…**.

### Discovery and format

- `views/` joins `components/` in the sidebar as **Views**; the only
  difference from a component is the canvas default width. `app/` is
  still read for Next projects. `routes/` is never scanned.
- `ProjectFormat` gains `'scamp'` in `src/shared/types.ts`, and
  `detectProjectFormat` (`src/main/ipc/projectFormat.ts`) reads it from
  `views/` plus a `scampjs` dependency. Nothing creates a
  `scamp` project yet; this is so phase 3 doesn't touch detection.

### Agent guidance

- `src/shared/templates/agentMd.ts`: the three-file contract, the
  binding grammar, "compute in logic, bind in the view", route files
  are never regenerated, and the portability promise. The MCP server
  gets `scamp_get_view_props` so an agent can ask for a view's inferred
  props type.

### Tests and exit

- Unit: every new `lib/` file, the extended round-trip invariant.
- Integration: a generated view written to disk, parsed back, equal.
- E2E: Data tab rows, canvas repeat and show-if, parity fixtures.
- Done when: a view with all five binding kinds round-trips, renders
  on the canvas from its samples, and previews unchanged in Next.

## Phase 2 — `scamp dev` [framework]

Goal: a dev server that runs a phase-1 project and is a drop-in preview
target for the app. Produces **contract 1**.

- Vite plugin: file-based routing over `routes/` (`[param]`,
  `[...rest]`, `(group)`), the `@/` alias, `design/theme.css`
  injection, and the document shell (there is no `layout.tsx`).
- Runtime (`scampjs/runtime`): `RouteProps`, `LoadContext`,
  `Link`, `useParams`, `navigate`, on Preact. A few hundred lines.
- Hono app: serves Vite's assets in dev, runs `load()` with a
  `LoadContext` (`params`, `request`, `env`) built by the dev adapter
  (`env` from `.dev.vars` plus `process.env`). Route files never see a
  Hono context.
- `/_views/<Name>`: renders any view with its defaults; the preview
  target and the parity target.
- Readiness: one stable line on stdout (`scamp dev ready http://127.0.0.1:<port>`)
  that the app's ready detector matches; a `--port` flag; a
  `--json` log mode for the app's request-log view.
- Templates export (`scampjs/templates`): the project
  template (`views/`, `routes/index.tsx`, `design/`, `package.json`
  scripts, `agent.md` stub) and the component and view templates, so
  the app scaffolds from the same source as `create-scampjs`.
- Publish `scampjs` 0.1 with `contract: 1` in `package.json`.
- Done when: a project scaffolded from the templates runs, `/_views/`
  renders every view, and a `load()` reads `env`.

## Phase 3 — preview through `scamp dev` [app]

Goal: the app previews a `scamp`-format project with the framework
instead of Next, and the parity harness runs against it.

- `src/main/devServer/devServerManager.ts`: spawn `scamp dev` for
  `format === 'scamp'`, `next dev` otherwise. `readyDetector.ts` matches
  the phase-2 readiness line. First-preview install stays as it is,
  installing the project's own `package.json`.
- `src/main/previewWindow.ts`: a view preview opens `/_views/<Name>`;
  a route preview opens the route.
- Compatibility: the app declares a supported `contract` range in
  `src/shared/projectConfig.ts`; on open it reads the installed
  framework's `package.json` and shows the existing-style banner when
  the project is outside the range.
- Scaffold: `src/main/ipc/projectScaffold.ts` gains a `scamp` branch
  that writes from `scampjs/templates`, behind a flag until
  phase 5. The app takes the framework as a devDependency for tests
  only; it is never bundled.
- Parity: `test/e2e/parity/` learns to serve fixtures through
  `scamp dev` as well as the current browser render, and the phase-1
  binding fixtures run there.
- Done when: a flagged new project previews through `scamp dev`, and
  cold-start and install-size numbers are recorded in
  `docs/notes/framework-preview.md`.

## Phase 4 — `scamp build`, rendering modes, islands, `create-scampjs` [framework]

Goal: the standalone story. Someone with no Scamp installed can create,
build, and deploy a project.

- `export const render = 'static' | 'server' | 'client'` per route,
  default `static`. A static route with `load()` prerenders when it
  exports `params()`, and falls to `server` otherwise.
- Islands: the build reads each view's `_scamp` metadata for declared
  event props; a static route whose views have none ships no
  JavaScript; otherwise only those views hydrate.
- `scamp build`: prerender static routes to HTML and CSS, bundle server
  routes into the Hono app, ship client routes as an SPA entry.
- `scamp preview`: serve the build as an adapter would.
- The static adapter (a folder) is built in; `server` mode is gated on
  phase 6's first adapter and errors clearly until then.
- `create-scampjs`: `npm create scampjs`, using the templates export, with
  the optional database question wired but only `none` available until
  phase 6.
- Docs site from `docs/website/scamp-framework.md` plus reference
  pages for routing, `load()`, rendering modes, and the file contract.
- Publish `scampjs` 0.2 and `create-scampjs` 0.1.
- Done when: `npm create scampjs && npm run build` produces a folder that
  serves correctly from any static host, with zero JavaScript on a
  route without events.

## Phase 5 — new projects on the Scamp structure; Next migration [app]

Goal: the format switch, with the promise that nothing about an
existing project changes because Scamp updated.

- **New project** always scaffolds the Scamp structure (drop the
  phase-3 flag). `ProjectFormat` is `'legacy' | 'nextjs' | 'scamp'` in
  earnest.
- `src/main/ipc/projectMigrate.ts`: `migrateNextjsToScamp`, following
  `migrateLegacyToNextjs` — snapshot first, then the per-file table
  from the framework plan (`app/page.tsx` → `views/Home/` +
  `routes/index.tsx`, `app/theme.css` → `design/`, `package.json`
  rewritten, `layout.tsx` and `next.config.ts` removed), then a report
  in the `unmovedFiles` shape listing `features/*`, `app/api/**`, and
  anything else it didn't own. The migrated view is byte-identical in
  markup to the page; the parity harness asserts it.
- A `ScampMigrationBanner` beside `NextjsMigrationBanner`, with a
  `scampMigrationDismissed` flag in `scamp.config.json`.
- The Next path is frozen: no new features to `readProjectNextjs` or
  the `next dev` preview. `docs/notes/nextjs-sunset.md` lists every
  Next-specific file so they can be removed together, and the criteria
  (migration offered for several releases; opted-in telemetry shows a
  negligible share).
- E2E: the core specs run against both formats via the `projectOptions`
  fixture; the migration has its own spec.
- Done when: a fresh project is `scamp`-format end to end, a Next
  project migrates with a report and reopens looking identical, and an
  unmigrated Next project behaves exactly as before.

## Phase 6 — API routes, the Drizzle recipe, the Cloudflare adapter [framework]

Goal: the full-stack story, where the Noise app went.

- `routes/api/**`: a file exports plain handlers (`GET`, `POST`, …)
  over `LoadContext` returning a `Response`, mounted by the framework;
  or a default-exported Hono app for in-file routing, middleware, and
  the typed client. Both documented; plain is the default in every
  template.
- `Env` typing: `scamp-env.d.ts` augmentation in the templates; each
  adapter documents what it puts in `env`.
- `scamp add <recipe>`: the recipe runner, reading recipes from the
  templates export. First recipe `drizzle`, with the SQLite, Postgres,
  and D1 variants: writes `db/schema.ts`, `lib/db.ts`, `drizzle.config.ts`,
  `.dev.vars`, the `db:*` scripts, the `Env` augmentation, and the
  **Database** section of `agent.md`. `create-scampjs` enables the
  database question.
- `@scampjs/adapter-cloudflare`: Workers and Pages; `env` from bindings;
  `server` routes run per request; `static` routes to Pages assets.
- Publish `scampjs` 0.3, `create-scampjs` 0.2,
  `@scampjs/adapter-cloudflare` 0.1. Contract bumps to `2` (API handler
  shapes and the `Database` section of the file contract).
- Done when: a project with a D1-backed `load()` and a plain `POST`
  handler deploys to Cloudflare from `scamp build`, and the same
  project runs locally on SQLite with no code change.

## Phase 7 — full-stack in Scamp's UI [app]

Goal: the backend is first-class in the app without the app becoming a
backend builder.

- A **Routes** list beside Views in `PageSidebar` / a new
  `RoutesSidebar`: each route file, its render mode as a segmented
  control (writes the `render` export), and its API routes. Opening one
  goes to the code panel.
- **Generate route**: writes `routes/<path>.tsx` whose `load()` returns
  the view's sample data, typed from phase 1's inference; with a
  database present, a commented Drizzle query in the same shape.
- Request logs from `scamp dev --json` in the existing app-log view.
- `.dev.vars` handled like `.scamp/`: gitignored, never uploaded, shown
  in Settings.
- The `agent.md` template consumes the framework's **Database** section
  rather than duplicating it; the MCP server adds `scamp_list_routes`.
- Compatibility range raised to contract `2`; the phase-3 banner covers
  older projects.
- Done when: a designer can draw a view, click Generate route, run the
  preview, and an agent can replace the sample query with a real one
  using only `agent.md` and the MCP tools.

## Phase 8 — further adapters [framework]

`@scampjs/adapter-node`, `-vercel`, `-netlify`, as demand shows. Each is
thin: Hono already runs there; the adapter fills `env` and maps
`static`, `server`, and `client` routes to the host's model. No app
changes.

## Cross-cutting

### Contract versioning

| Contract | Introduced by | Consumed by |
|---|---|---|
| 0 | Phase 0 | nothing runs |
| 1 | Phase 2 (`scamp dev`, templates, readiness line) | Phase 3 |
| 2 | Phase 6 (API handler shapes, Database section, recipes) | Phase 7 |

The app declares a range (`>=1 <3` after phase 7). The framework bumps
the major of `contract` only when a row of the file or CLI contract
changes shape; additions don't bump it.

### Testing, per repo

- **[framework]** Vitest for routing, `load()`, build output per mode,
  islands selection, the recipe runner, and each adapter; a fixtures
  directory of tiny projects built in CI; no Electron.
- **[app]** Unchanged rules: everything in `src/renderer/lib/` fully
  tested, the round-trip invariant extended per binding kind, parity
  fixtures per binding kind, e2e on both project formats. The framework
  is a devDependency so the parity harness and preview specs can run
  `scamp dev`.

### Releases

The framework releases on its own tags. An app release names the
framework range it supports in the changelog. New projects are
scaffolded pinned to the newest version inside that range.

### Risks, and where they're absorbed

- **The binding grammar grows.** Phase 1 owns the line: five kinds,
  paths only, no expressions. A request for more is a request for a
  route file or a hand-written component.
- **Preact compatibility.** Phase 2 makes the runtime a config line so
  a project can swap to React; the app doesn't care.
- **Two formats for a while.** Phase 5 freezes the Next path and writes
  the removal list on the same day it ships the migration.
- **Framework maintenance.** Phases 2 through 6 keep the package at
  conventions plus tooling on Vite and Hono; the "read it in an
  afternoon" size target is a review criterion on every framework PR.
