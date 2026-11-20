# Release 0.16.0 checklist

PR #12 (`feat/embedded-attach-rails`) holds 3 commits since `v0.15.0`.

## What ships

All of it is in Edit React Project, still behind the early-access flag.
The changelog's Unreleased section lists it.

- **Edit an app that's already running, such as a Rails app** (`7a091c8a`).
  Scamp attaches to the address you give it instead of starting a server,
  maps elements to ERB templates, partials, and ViewComponents, lists
  routes from `bin/rails routes`, follows Turbo visits, and reloads after
  the agent writes.
- **The Style tab's header** (`1ff05270`). A long name no longer pushes
  the buttons off screen; **Apply to** and **State** are labeled rows.
- **My agent connects in a window** (`1ff05270`). The steps and a
  full-size terminal open over the editor and minimize into the **Agent**
  tab once the agent connects.
- `c690cf0c`, the 0.15.0 release doc, which never reached `main`.

**Test run on the branch (2026-11-20):** typecheck clean; 4,970 unit and
integration tests pass; the build succeeds. e2e: all 9 `test/e2e/embedded/`
spec files, 12 tests, pass.

## Before the merge

### Automated

- [x] CI passes on PR #12 at `1ff05270` (run 44835785729). The checklist commit after it is docs only, which CI skips.

### Manual (Angie)

Done by Angie, 2026-11-20.

On the build, in Edit React Project:

- [x] Attach to `riq_railsapp` running on its port. Elements select and
  show their template; an edit is written into the `.html.erb`, and the
  page reloads after the agent writes.
- [x] Open Scamp from the desktop, not a terminal, and attach to the Rails
  app. The path field lists its routes. If it doesn't, `bin/rails routes`
  couldn't find Ruby (a known gap; see below).
- [x] Click a Turbo link in the Rails app. Selecting still works on the
  new page.
- [x] A Vite or Next.js project still opens and edits as in 0.15.0.
- [x] Select an element with a long component name. The buttons stay in
  view, and the **Apply to** line reads sensibly for This one and All N.
- [x] Choose **My agent**. The window opens; **Start Claude Code** and
  **Paste the prompt** work; once Claude Code connects, the window
  minimizes, and **Open terminal** brings it back with the session intact.

## Release

- [x] Merge PR #12 into `main` (`5f2f6570`).
- [x] `npm version 0.16.0 --no-git-tag-version`.
- [x] In `docs/CHANGELOG.md`, rename `### Unreleased` to
  `### 0.16.0 (2026-11-20)`.
- [x] Commit as `release: 0.16.0`.
- [x] Push `main`, then tag `v0.16.0` and push the tag. The tag starts
  `.github/workflows/release.yml`.
- [x] Watch the workflow through `verify-feed`, then publish the draft
  with `gh release edit v0.16.0 --draft=false --latest`. Run 44836288695
  passed every job on the first try; published with 12 assets.

## Known gaps, not blocking

- **The selection clears after the Rails app reloads.**
- **`bin/rails routes` may not find Ruby when Scamp is opened from the
  desktop**, since the app doesn't get the shell's `PATH` (rbenv, asdf).
  The path field is then empty; typing a path still works.
- **Moves in ERB go to the agent.** Scamp doesn't write them itself.
- Carried from 0.15.0: CSS comments dropped on save, curly braces in text,
  and the conflict check and rename not being atomic.

## After the release

- The website's public changelog and docs leave Edit React Project out
  until it leaves early access.
