# Release 0.12.0 checklist

`main` holds `feat/token-tooltips`, `fix/multi-select`, and
`feat/onboarding`, merged locally and not pushed.

**Test run on merged `main`:** typecheck clean; 4,730 unit and
integration tests pass; full e2e 609 passed, 2 failed, 2 skipped
(34 minutes).

## Blockers

- [ ] **A page root that sets `background: #ffffff` draws transparent on
  the canvas.** `parity: table-rows-and-cells` fails every time. It
  passes on `v0.11.1`. Cause: `149f75e3` paints a root whose background
  equals the white default as transparent, because the generator never
  writes that default. The parser reads a missing background and an
  explicit `#ffffff` as the same white, so an explicit white root
  diverges. The generator also drops an explicit white on save, so the
  model loses it either way.
  - Smallest fix for the release: limit the transparent rule to
    component roots, the case `149f75e3` was for. Pages draw white as
    they did in 0.11.1.
  - Lasting fix: make the root's default background `transparent`,
    which is what the browser draws, and drop the special case. It
    touches every page's canvas and the round-trip tests, so it's
    better after the release.

## Flaky, not blocking

- [ ] `canvas/select-move-resize: clicking a rect selects it…` failed
  once and passed three reruns. The locator found two elements with
  the same `data-scamp-id`, the second outside the canvas, which looks
  like a thumbnail capture's copy of the page caught mid-capture. To
  make the spec steady, scope `canvasElement` to the canvas frame.

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

- [ ] Fix the blocker, and rerun `test/e2e/parity/parity.spec.ts` and
  `test/e2e/components/component-canvas-parity.spec.ts`.
- [ ] `npm version 0.12.0 --no-git-tag-version`, which updates
  `package.json` and `package-lock.json`.
- [ ] In `docs/CHANGELOG.md`, rename `### Unreleased` to
  `### 0.12.0 (<date>)`.
- [ ] Commit as `release: 0.12.0`.
- [ ] Push `main`, then tag `v0.12.0` and push the tag. The tag starts
  `.github/workflows/release.yml`.
- [ ] Watch the workflow through the `verify-feed` job.
- [ ] On an installed 0.11.1, confirm the app offers the update and
  installs it.

## Cleanup

- [ ] Delete the merged branches: `feat/token-tooltips`,
  `fix/multi-select`, `feat/onboarding`, and
  `fix/right-anchored-offsets`.
- [ ] Drop the two stashes that are now committed:
  "feat/onboarding: tutorial work (uncommitted)" and
  "feat/token-tooltips: agent variant guidance (uncommitted)".
- [ ] Remove the `../scamp-release` worktree, and check out `main` in
  the usual checkout.
