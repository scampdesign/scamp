# Release 0.13.0 checklist

`main` holds `exp/canvas-rendering` (the iframe canvas, saved instance
positions) and `feat/resizable-panels`, merged locally and not pushed,
with one fix on top (`4a345292`).

**Test run on merged `main` (2026-11-02):** typecheck clean; 4,759 unit
and integration tests pass; full e2e 626 passed, 0 failed, 6 skipped (the
opt-in speed bench, `SCAMP_E2E_SPEED=1`), 26 minutes. The suite runs on
the iframe canvas; `SCAMP_E2E_LEGACY_CANVAS=1` runs it on the fallback.

`fix/canvas-scroll-containers` merged after that run (`b0b8608d`). Its new
spec and the selection, drag, zoom, overflow, instance and variant specs
pass on both canvases (39 on the iframe, 38 + 1 iframe-only skip on the
legacy one); the full suite has not run again since.

## What ships

- **The iframe canvas is the default.** The page draws as the HTML export
  in a same-origin iframe, so `@media`, `vh` and `vw` behave as in the
  preview. The legacy canvas stays one release as a fallback:
  `__scampIframeCanvas.set(false)` in the developer tools. see
  `docs/notes/iframe-canvas.md`
- **Instance positions are saved.** A placed instance writes `position`,
  `left` and `top` into its page rule. An instance in the flow reads as
  `static` and writes nothing. Existing projects gain a rule on the next
  save of a page with a placed instance.
- **The project cover stays the home page**, and **the HTML export draws
  an instance's variant**.
- **Scroll containers scroll on the canvas** under the wheel, then the
  canvas pans; their scrollbars are drawn lighter (`fix/canvas-scroll-containers`).
- **Resizable and hideable panels** (`docs/plans/resizable-sidebar-plan.md`).

## Blockers

- [x] **The overflow indicator didn't show on the iframe canvas.** The
  iframe draws after its own load and widens to show overflow, and neither
  resized the frame, so the extent was never measured again. The frame's
  `ResizeObserver` now watches the iframe's host (`4a345292`). Found by the
  first full run on merged `main`, which also had two specs expecting an
  instance tag to end at its id.

## Manual testing

- [x] **Iframe canvas, sections 1 to 8** of the test run
  (<https://claude.ai/artifact/15TNJzNxbGvxqgGYKto74V>): dragging and
  resizing, text editing, the component editor and variant sets, undo and
  outside edits, breakpoints and overflow, theme and fonts, thumbnails and
  export.
- [x] **Re-test of the fixes from that run**: undo after a text edit and
  the other shortcuts, the 900px floor, saved instance positions, instances
  in the flow, PNG export without the outline, the project cover.
- [ ] **Long session (section 9).** Design for 20 to 30 minutes, switching
  pages and components often. Watch for slowdowns, memory growth in the
  developer tools' **Task Manager**, and outlines left on deselected
  elements.
- [ ] **Large variant sets.** Open ChainStrip in the glitch project: it
  opens, draws its authored frames with the notice, and editing a frame
  stays fast. Each frame is an iframe now, and a large set's speed was
  never measured.
- [ ] **Saved instance positions on a real project.** Open a project with
  placed instances, save a page, and read the diff: placed instances gain
  a `.inst_….inst_…` rule with `position`, `left` and `top`; instances in a
  row, a column or the flow don't change.
- [ ] **Scroll containers.** In riq-frontend's `AdminAudit` view, the
  wheel over the table scrolls it, then the canvas once it reaches the
  end; Shift scrolls sideways; a row selected inside it keeps its outline
  while it scrolls; the scrollbars look lighter than the system's.
- [ ] **The fallback.** `__scampIframeCanvas.set(false)` switches to the
  legacy canvas and survives a restart; `set(true)` switches back.
- [ ] **Resizable panels.** Drag the left panel's edge (200 to 480px) and
  double-click it to reset; hide it with the open section's rail button,
  **Cmd+B**, and a drag past 120px; resize the code panel and the terminal;
  move each edge with the arrow keys. Sizes survive a restart.

## Release

- [ ] `npm version 0.13.0 --no-git-tag-version`, which updates
  `package.json` and `package-lock.json`.
- [ ] In `docs/CHANGELOG.md`, rename `### Unreleased` to
  `### 0.13.0 (2026-11-02)`. If you tag on another day, change the date
  to the tag date.
- [ ] Commit as `release: 0.13.0`. If a fix lands after it, add it to the
  0.13.0 notes before tagging.
- [ ] Push `main`, then tag `v0.13.0` and push the tag. The tag starts
  `.github/workflows/release.yml`.
- [ ] Watch the workflow through the `verify-feed` job.
- [ ] On an installed 0.12.0, confirm the app offers the update and
  installs it.

## Cleanup

- [ ] Delete the merged branches `exp/canvas-rendering` and
  `feat/resizable-panels`. They were local only.
- [ ] Decide on the six old unmerged branches (`backup/phase-7-premerge`,
  `code-comparison`, `examples/scamp-ui`, `feat/component-variants`,
  `feat/framework-phase-1`, `feat/framework-phase-3`), 276 to 466 commits
  behind `main`: check whether their work is already in `main`, then
  delete or keep.

## After the release

- Delete the legacy canvas and the inline translation layer, one property
  group at a time, measured by the parity harness (the plan's phase D,
  `docs/plans/canvas-iframe-plan.md`). The fallback goes with it.
- Group drag is on hold.
