# Release 0.12.0 checklist

`main` holds `feat/token-tooltips`, `fix/multi-select`, and
`feat/onboarding`, merged locally and not pushed.

**Test run on merged `main`:** typecheck clean; 4,730 unit and
integration tests pass; full e2e 609 passed, 2 failed, 2 skipped
(34 minutes).

## Blockers

- [x] **A page root that sets `background: #ffffff` drew transparent on
  the canvas.** Fixed on `fix/root-background`: the root's default
  background is now `transparent`, what a browser draws, and the canvas
  special case from `149f75e3` is gone. An explicit white is kept and
  written back. Page exports and thumbnails still get white behind a
  transparent page, from the canvas frame and the thumbnail backfill.

## Flaky, not blocking

- [x] `canvas/select-move-resize: clicking a rect selects it…` failed
  once and passed three reruns. The locator found a thumbnail
  capture's off-screen copy of the page too. `canvasElement` now
  matches inside the canvas frame only (`fix/e2e-canvas-element`).

## Manual testing

- [ ] **Tutorial.** Settings → Tutorial → Start the tutorial, and do
  all six lessons. Check the ring on each control, reopening a done
  lesson, the **Tutorial** pill under Pages and Components, and the
  way back from the component editor. Skip it from a fresh first run
  and confirm nothing shows.
- [ ] **Multi-select.** Cmd-click on the canvas and in the layers
  panel. Shift-click siblings in the layers panel, and Shift-click
  across levels, which selects only the clicked row. Group a Shift
  range with Cmd+G.
- [ ] **Large variant sets.** Open ChainStrip in the glitch project:
  it opens, draws its authored frames with the notice, and saves
  quickly. Checks shows the warning.
- [ ] **Token tooltips.** Hold the pointer over a token-valued field.
- [ ] **Canvas fixes.** A component nested in a component draws on the
  page; an agent edit to a closed component shows; a component with
  no background is transparent; a flow child stays in flow.
- [ ] **Agent guidance.** A new project's `AGENTS.md` has the "Keep
  the set small" section.

## Release

- [x] Merge `fix/root-background` into `main`.
- [x] `npm version 0.12.0 --no-git-tag-version`, which updates
  `package.json` and `package-lock.json`.
- [x] In `docs/CHANGELOG.md`, rename `### Unreleased` to
  `### 0.12.0 (2026-10-30)`. If you tag on another day, change the
  date to the tag date.
- [x] Commit as `release: 0.12.0`. If a fix lands after it, add it
  to the 0.12.0 notes before tagging.
- [ ] Push `main`, then tag `v0.12.0` and push the tag. The tag starts
  `.github/workflows/release.yml`.
- [ ] Watch the workflow through the `verify-feed` job.
- [ ] On an installed 0.11.1, confirm the app offers the update and
  installs it.

## Cleanup

- [x] Delete the merged branches: `feat/token-tooltips`,
  `fix/multi-select`, `feat/onboarding`, `fix/right-anchored-offsets`,
  `fix/root-background`, and `fix/e2e-canvas-element`. They were local
  only.
- [x] Drop the two stashes that are now committed.
- [x] Remove the `../scamp-release` worktree, and check out `main` in
  the usual checkout.
