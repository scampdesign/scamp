# Release 0.15.0 checklist

`feat/embedded-undo-history-breakpoints` holds 17 commits since `v0.14.0`.

## What ships

- **Edit React Project, the second round.** This includes drag to reorder,
  your own agent over MCP, undo and History, tablet and phone widths,
  editing text, images, and links, structure edits (delete, duplicate,
  wrap, and move into another parent), Scamp writing some edits itself, the
  Agent tab's conversation, and scope buttons that name the component. It's
  still behind the early-access flag. The changelog's Unreleased section
  lists all of it.
- **The repo audit's fixes** (`docs/plans/2026-11-10-repo-audit.md`): Must
  fix items 1–9 and Should fix items 11–15, most of 16, and Lean items
  17–19. They're in the changelog's **Fixed** section, except the Lean
  items, which users can't see.
- **The quoted-attribute fix.** `defaultChecked={tool.on === "true"}` was
  saved broken and showed `'=' is not a valid attribute name` on the canvas.

**Test run on the branch (2026-11-16):** typecheck clean; 4,949 unit and
integration tests pass, 1 skipped; the build succeeds. e2e, run after the
lean items: `draw-text`, `select-move-resize`, `external-css-edit`,
`element-writes`, `image-import-indicator`, `image-reuse`,
`nextjs-to-scamp`, `scamp-project-preview`, terminal `multiple-tabs`,
`embedded-edit`, `project-thumbnail`, and `variants` (26 tests).
Before 17: `iframe-c1`, `agent-history`, the instance and variant specs,
`selection-outline`, `scroll-containers`, and `iframe-scrollbars`
(37 tests).

**Full e2e run (2026-11-18):** 642 tests, 632 passed, 2 skipped, 8 failed.
All 8 timed out in `selectTool`, clicking a corner of the canvas frame the
canvas covered, and passed on a rerun. `selectTool` now blurs instead of
clicking (`d6693376`), and the 15 spec files around it pass (45 tests).

## Before the merge

### Automated

- [x] Covered by the full run above. Run each `test/e2e/embedded/` spec this branch changed that hasn't run
  since the generated files were deleted, one file at a time, after
  `npm run build`:
  - [x] `embedded-content`
  - [x] `embedded-modes`
  - [x] `embedded-own-agent`
  - [x] `embedded-reorder`
  - [x] `embedded-states`
  - [x] `embedded-structure`
  - [x] `embedded-undo-history`
- [ ] Push the branch and open a PR. CI hasn't run on any of these commits.
  It's the first run without the generated `.js` files and without
  `patch-package`, on Linux, macOS, and Windows.

### Manual (Angie)

Done by Angie, 2026-11-18.

The changes to developer setup, which no automated test covers:

- [x] `npm run dev` starts, and an edit to a `.tsx` reloads. It now reads
  `electron.vite.config.ts`, since its generated `.js` copy is gone.
- [x] A fresh `npm ci` succeeds without `patch-package`.

In the app, on the build:

- [x] Drop an image on the canvas. It's optimized and placed. The image
  process now runs from a different file in development.
- [x] A variant set and an instance in a variant draw correctly, and
  thumbnails on the projects screen update. These are the canvas parts the
  old canvas's removal touched.
- [x] Open clarity-voice's `exercise-editor` and edit the tool switch. The
  line `defaultChecked={tool.on === "true"}` survives the save.
- [x] Pause sync, make an edit, and quit. The edit is in the files when you
  reopen.

Edit React Project, on a real Vite project and a real Next.js project:

- [x] Reorder by dragging, on the page and in **Layers**.
- [x] **My agent** with Claude Code: an edit is written through MCP.
- [x] Cmd+Z undoes your edit and the agent's. **History** goes back.
  - Undo and History are refused while the agent is working. Confirm the
    message makes sense.
- [x] Edit at the tablet and phone widths.
- [x] Edit text, an image from disk, and a link.
- [x] Delete, duplicate, wrap, and move an element into another parent.
- [x] The **Agent** tab shows the conversation. Undo a turn, and reply.
- [x] A long session: accept, then keep working. Runs still succeed.
- [x] Discard keeps an uncommitted file you changed yourself.
- [x] A project in a subfolder of a repository: the change list, Discard,
  and the branch link work.
- [x] Close the window with terminals open. No shell is left running
  (`ps` shows none from that project).

## Release

- [ ] Merge the PR into `main`.
- [ ] `npm version 0.15.0 --no-git-tag-version`.
- [ ] In `docs/CHANGELOG.md`, rename `### Unreleased` to
  `### 0.15.0 (<date>)`.
- [ ] Commit as `release: 0.15.0`.
- [ ] Push `main`, then tag `v0.15.0` and push the tag. The tag starts
  `.github/workflows/release.yml`.
- [ ] Watch the workflow through the `verify-feed` job. The GitHub release
  is a draft with the same assets as 0.14.0's.
- [ ] On an installed 0.14.0, confirm the app offers the update and
  installs it. This step was never checked for 0.14.0 itself, so do it on
  0.13.0 to 0.14.0 as well if a 0.13.0 install is still around.
- [ ] Signed in as an admin, **Edit React Project** shows on the start
  screen; as an account without access, it doesn't. Also never checked for
  0.14.0.

## Known gaps, not blocking

- **CSS comments are still dropped on save** (audit 16). The element model
  has nowhere to keep them.
- **Curly braces in text break the page** (audit 10). Skipped.
- **The conflict check and the rename aren't atomic** (audit 13). An edit
  that lands in the short gap between them is still overwritten.
- **A file already broken like clarity-voice's still errors on the
  canvas.** The fix stops Scamp writing it; the canvas doesn't skip an
  invalid attribute name.
- **The audit's Nice to have items, 20–28.** None are started.

## After the release

- The website's public changelog and docs leave Edit React Project out
  until it leaves early access, as for 0.14.0.
