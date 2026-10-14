# Preview through the framework

How the app previews a Scamp-framework project, what it measures the
framework against, and the numbers phase 3 recorded. The plan is
`docs/archive/2026-09-16-framework-phase-3-plan.md`; the framework's side is
`CONTRACT.md` section 2 in the scampjs repo.

## Which server, and how the app knows it's up

`devServerManager.ensureDevServer` reads the project format first. A
Next.js project keeps running its own `npm run dev` and is detected
through the `Local:` / `Ready in` lines. A `scamp`-format project runs
the installed binary directly:

```
node node_modules/scampjs/bin/scamp.js dev --port <free port>
```

and is ready when stdout carries the one line the contract fixes,
`scamp dev ready http://127.0.0.1:<port>`, matched whole-line by
`detectScampReady`. The binary is spawned by path rather than through
`npm run dev` so the app knows exactly which process it is watching and
needs no shell on Windows. It runs with `--json`, and each request or
error line is forwarded to the app log (see `routes-in-the-app.md`). If the binary is missing after the
first-preview `npm install`, the status flips to crashed with a message
naming the fix; the install itself is unchanged and installs whatever
the project's `package.json` asks for.

## What a preview shows

A Next.js project previews a page at its route, and a view at its
wrapper page's route. A framework project has no wrapper pages, so a
view previews at `/_views/<Name>`, which renders the view with its
defaults inside the framework's document shell. The preview window's
page list holds the views by slug, and `PreviewOpenArgs.routes` maps
each slug to its `/_views/` path; `pageNameToRoute` prefers that map and
falls back to the Next.js convention. Routes under `routes/` are not
listed yet; that is phase 7.

## The contract range

`SUPPORTED_CONTRACT` is `0–1`. New files get `WRITTEN_CONTRACT` (1).
A file that declares another version inside the range keeps it: the
parser records `contract` on the root element only when it differs from
the written one, and the generator writes it back. Contract 1 added the
CLI and not a file shape, so the published contract-0 fixture still
round-trips byte for byte, and a project on scampjs 0.1 opens without
the compatibility banner.

## The flagged scaffold

`createProject({ format: 'scamp' })` is accepted only when the main
process sees `SCAMP_FRAMEWORK_PROJECTS=1`; the e2e launcher sets it.
The scaffold dynamically imports `scampjs/templates`, which is a
devDependency and is marked external in `electron.vite.config.ts`, so
it resolves from `node_modules` in development and tests and fails with
a clear message in a packaged build. Phase 5 decides how the packaged
app gets the templates.

## Parity against the framework

`test/e2e/parity/framework.spec.ts` writes each parity fixture into a
temporary framework project under `test/e2e/parity/.tmp/`, starts
`scamp dev` from the repo's devDependency, and compares the canvas
geometry with `/_views/Home` in a plain Chromium. A fixture with one
unadorned component instance compares the instance's subtree on the
canvas, rebased to its origin, with the component rendered as a view of
its own: the framework passes `data-scamp-instance-id` to the component,
which drops it, so a page and its instances cannot be keyed the way the
canvas keys them. Fixtures with several instances or with overrides are
skipped and say why.

The framework project's theme carries `body { margin: 0; min-height:
100vh }`, which the Next.js layout sets inline. The framework template's
default theme does not yet include it; the parity harness adds it, and
the template should (a scampjs change).

## Numbers (2026-09-14, Linux, warm npm cache)

A project scaffolded from `scampjs/templates`:

| Measure | Value |
|---|---|
| `npm install` | 4.2 s, 16 packages, 41 MB (19 MB of it the rolldown binary) |
| `scamp dev` spawn to readiness line | 250–260 ms |
| First `/_views/Home` render | 110–180 ms |
| Second render | 7–9 ms |

For comparison, the preview docs describe `next dev` as taking 2–5
seconds to start, and a Next.js project's `node_modules` runs to several
hundred megabytes.
