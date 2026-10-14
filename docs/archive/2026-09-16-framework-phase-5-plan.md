# Framework phase 5 — new projects on the Scamp structure; the Next.js migration — Plan

Status: **implemented on 2026-09-14** on `feat/framework-phase-3`
(stacked on phase 1). Source: "Phase 5" of `scamp-framework-tech-plan.md`.
Needs `scampjs` 0.2.1 (templates take the version to pin).

## Goal

The format switch: a new project is a Scamp-framework project end to
end, a Next.js project migrates with a report and reopens looking the
same, and an unmigrated Next.js project behaves exactly as before.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Templates in the packaged app | `scampjs/templates` bundled into main; the rest of the package stays out | The subpath is small and pure; the app passes the `scampjs` version it was built against, so a new project pins what the contract range was tested with. |
| Default format | `scamp`; `nextjs` on request only | The plan's first commitment. The frozen path stays reachable for tests. |
| Plain pages in the migration | Converted in the renderer first, with the page menu's own Convert code | The parser and generator live in the renderer; the main process only moves files and refuses if a plain page remains. |
| `node_modules` | Moved to the backup | It holds Next; leaving it would make the first preview skip the install and fail on a missing `scampjs`. |
| `tsconfig.json` | Replaced when byte-identical to the app's template, else kept and listed | A customised config is the user's; its `react` path mapping needs one edit. |
| Report | `unmovedFiles` on the result, logged by the banner | The same shape as the legacy migration. |
| Both formats in e2e | `SCAMP_E2E_FORMAT` picks the fixture's default format | Any spec folder runs against `scamp` or `nextjs` with one variable; the new banner is dismissed by default so it never covers the canvas. |

## What landed

- `src/main/ipc/projectScaffold.ts`: `scaffoldScampProject` from the bundled templates, pinning `SCAFFOLDED_SCAMPJS_RANGE`; the flag is gone.
- `src/main/ipc/project.ts`: `createProject` defaults to `scamp`; `migrateProject` steps `legacy → nextjs → scamp`.
- `src/main/ipc/projectMigrate.ts`: `migrateNextjsToScamp`, `rewritePackageJsonForScamp`.
- `src/renderer/src/components/ScampMigrationNotice.tsx` (a properties-panel section); `convertAllPagesToViews` in `useComponentManagement`; `scampMigrationDismissed` in `scamp.config.json`.
- `test/e2e/fixtures/project.ts`: `format: 'scamp'`, `SCAMP_E2E_FORMAT`, `scampMigrationBanner`.
- `test/e2e/migration/nextjs-to-scamp.spec.ts`; integration tests for the main-process migration.
- `docs/notes/nextjs-sunset.md`; user docs and the changelog.

## Left for later (closed)

Running the canvas specs under `SCAMP_E2E_FORMAT=scamp` found four
cases that failed in a view. All four had one cause: a view kept the
component artboard, with its corner resize handles and its own size,
instead of the page canvas. A view is a page's design, so it now gets
the page canvas: the breakpoint width and clip controls, the page
root's floor, and no artboard handles (`CanvasArea`, `ElementRenderer`,
`useProjectStoreSync` branch on `kind === 'component'`). The image
tool's click placement was a separate page-only gate, also removed.
The four specs run unskipped under both formats.

## Done when

- [x] A fresh project is `scamp`-format end to end (the preview spec creates one with no format argument and previews it).
- [x] A Next.js project migrates with a report and reopens with its views under Pages; the page markup is byte-identical inside the view.
- [x] An unmigrated Next.js project behaves as before (the nextjs specs pass; the banner is the only addition).
