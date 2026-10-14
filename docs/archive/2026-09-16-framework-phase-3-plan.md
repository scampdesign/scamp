# Framework phase 3 — preview through `scamp dev` — Plan

Status: **implemented on 2026-09-14** on `feat/framework-phase-3`,
stacked on `feat/framework-phase-1`. Source: "Phase 3" of
`scamp-framework-tech-plan.md`. Needs `scampjs` 0.1.0 (contract 1),
published from the framework's phase 2.

## Goal

The app previews a `scamp`-format project with the framework instead of
Next, and the parity harness runs against the framework's render.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| How to spawn | `node node_modules/scampjs/bin/scamp.js dev --port <n>` | The app knows the process it watches; no shell; the project's `dev` script is for the user. |
| Readiness | Whole-line match on the contract's one line | Nothing else on stdout before it; no false positives from stderr. |
| Preview target for a view | `/_views/<Name>` | The framework renders a view with its defaults; the app has no route list until phase 7. |
| Preview payload | `routes?: Record<slug, path>` on the open and navigate args | One optional field; Next.js projects don't set it and keep the `/` and `/<name>` mapping. |
| Contract range | `0–1`, written `1`, declared version preserved per file | Contract 1 changed no file shape; rewriting a file's number on save would churn every project. |
| Scaffold | Behind `SCAMP_FRAMEWORK_PROJECTS=1`, from `scampjs/templates` via a dynamic import marked external | The framework stays a devDependency and is never bundled; packaging is phase 5's question. |
| Parity | A second spec against `scamp dev`, geometry only, single-instance component fixtures rebased | The framework drops the instance marker the canvas keys by; comparing the view alone is what the framework can render. |
| Install | Unchanged: first preview runs `npm install` on the project's `package.json` | Nothing to add; the tests link the repo's copy instead. |

## What landed

- `src/main/devServer/devServerManager.ts`, `readyDetector.ts`: format-aware spawn and readiness.
- `src/shared/types.ts`, `src/renderer/preview/route.ts`, `PreviewApp.tsx`, `src/main/previewWindow.ts`, `src/main/ipc/preview.ts`: routes on the preview payload.
- `src/renderer/src/components/ProjectShell.tsx`, `ProjectHeader.tsx`: a view in a framework project previews; the tooltip says so.
- `src/shared/projectConfig.ts`, `lib/element/types.ts`, `parseCode/index.ts`, `generateCode/tsx.ts`: the range and the preserved contract.
- `src/main/ipc/projectScaffold.ts`, `project.ts`, `electron.vite.config.ts`: the flagged scaffold.
- `package.json`: `scampjs` ^0.1.0 and `preact` as devDependencies.
- Tests: contract preservation, the scamp readiness line, explicit routes, `test/e2e/preview/scamp-project-preview.spec.ts`, `test/e2e/parity/framework.spec.ts` with harness support.
- `docs/notes/framework-preview.md` with the numbers.

## Done when

- [x] A flagged new project previews through `scamp dev` (the e2e spec creates one, links the framework, and reaches `ready` with `/_views/Home` served).
- [x] The parity fixtures, the binding fixture included, match the framework's render.
- [x] Cold-start and install-size numbers recorded.

## Left for later

- The framework template's theme should carry the `body` margin reset the harness adds (scampjs).
- Route previews and a route list: phase 7.
- Shipping the templates in the packaged app, and the New project UI for the format: phase 5.
