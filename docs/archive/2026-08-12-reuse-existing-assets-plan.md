# Don't re-import images already in the project — Plan

Backlog: `docs/backlog-9.md` story 5.
Status: **implemented**.

One thing the plan missed, found while building it: returning the
filename derived from the path the *user picked* is wrong on a
case-insensitive filesystem. Choosing `HERO.PNG` on macOS resolves to the
file stored as `hero.png` — so the duplicate is correctly avoided, but the
reference written into the TSX is `./assets/HERO.PNG`, which works on the
dev machine and 404s from a case-sensitive host. The reuse path now reads
the real name from a directory listing, which is what the case-sensitivity
rule in CLAUDE.md prescribes.

An e2e was added on top of the planned integration tests — the story is a
user-facing bug report, and only e2e proves the whole path (IPC handler,
format-derived assets dir, real dialog) behaves as the user hit it.

## Context

Choosing an image that already lives in the project's assets folder
re-imports it as a copy, so `hero.png` becomes `hero-1.png`, then
`hero-2.png`. The asset folder fills with identical files and the page
references a different one each time.

---

## The cause, exactly

`copyImage` (`src/main/ipc/imageOps.ts:45`) copies unconditionally, and its
dedupe loop **guarantees** a rename when the source is already the
destination:

```ts
let fileName = `${base}${ext}`;
let destPath  = join(assetsDir, fileName);
while (true) {
  try {
    await fs.access(destPath);        // hero.png exists…
    fileName = `${base}-${counter}${ext}`;   // …so become hero-1.png
    destPath = join(assetsDir, fileName);
    counter += 1;
  } catch { break; }
}
await fs.copyFile(args.sourcePath, destPath);
```

Picking `<project>/public/assets/hero.png` finds `hero.png` occupied — by
itself — and copies the file next to itself under a new name. The loop is
correct for its original purpose (two *different* files sharing a name);
it just has no notion of "this is the same file".

## Why this happens so often

It isn't an edge case. **All three pickers open in the assets folder**:

- the image tool (`useDrawInteraction.ts:85`)
- Replace image (`ImageSection.tsx:39`)
- Set background image (`BackgroundSection.tsx:43`)

each passing `defaultPath: <project>/<assets dir>`. So the first thing the
dialog shows is the folder of already-imported images, and picking one is
the natural action. Reuse is arguably the *common* path, and it's the one
that misbehaves.

A fourth caller, the OS drag-and-drop insert (`useDropInsert.ts:64`), goes
through the same IPC and gets the fix for free.

---

## Decisions

### 1. Detect "same file" by identity, not by comparing path strings

The obvious fix — check whether `sourcePath` starts with the assets dir —
is the one that goes wrong quietly. Path strings can differ (`..`
segments, symlinks, a trailing slash) while pointing at the same file, and
**case is the trap this codebase already has a rule about**: on macOS's
case-insensitive APFS, `/Assets/Hero.png` and `/assets/hero.png` are the
same file, so a case-sensitive string compare misses the duplicate on
exactly the machines most development happens on. Comparing
case-insensitively instead would be wrong on Linux, where those are two
genuinely different files.

Compare file identity instead — `dev` + `ino` from `fs.stat`:

```ts
const candidate = join(assetsDir, basename(sourcePath));
const [src, dest] = await Promise.all([statOrNull(sourcePath), statOrNull(candidate)]);
const isSameFile = src && dest && src.ino !== 0 && src.dev === dest.dev && src.ino === dest.ino;
```

Immune to case, symlinks, and `..` on both platforms, because it asks the
filesystem rather than guessing from a string.

**Windows fallback.** `ino` is not reliably populated on Windows (the
`ino !== 0` guard above). Since NTFS is case-insensitive, a normalised
case-insensitive path comparison is the *correct* semantic there, so the
fallback is platform-appropriate rather than a compromise.

### 2. Skip the copy, return the existing file's reference

The return shape is unchanged — `{ relativePath, fileName }` pointing at
the file already on disk. Every caller keeps working; the element just
references the asset that was already there.

### 3. Don't suppress a watcher event for a write that didn't happen

`registerImageIpc` calls `suppressNextChange(destPath)` after every import
(`image.ts:60`) so Scamp's own asset write doesn't fire an
"changed externally" prompt. If we skip the copy, that suppression has no
write to match, and it will instead **swallow the next real change to that
file** — e.g. the user editing the SVG in another editor, whose reload
prompt then silently doesn't appear.

The window is bounded (entries expire after `ACK_EXPIRY_MS`, 400ms), so
this is a narrow race rather than a permanent hole. It's also free to
avoid: only suppress when a write actually happened. The handler needs to
know which case it was, so `copyImage` returns a `reused: boolean`.

### 4. Only exact-name matches in the assets root count as "already there"

Two cases deliberately still copy:

- **A file of the same name in a *subfolder* of assets**
  (`assets/icons/hero.png`). It isn't at the path the reference would
  use, so treating it as already-imported would produce a reference to
  the wrong file.
- **A byte-identical file somewhere else on disk.** Content-hash
  deduplication is a different feature — the story is about not
  duplicating a file that's already in the project, and hashing every
  import to save a copy of an *external* file isn't worth the cost.

---

## Phases

Small enough to be one change, split only to keep the test story clear.

### Phase 1 — `copyImage` skips a same-file import
Add the identity check and the `reused` flag. `imageOps.ts` is already
tsconfig-included and integration-tested, so this is where the coverage
goes.

### Phase 2 — the IPC handler stops suppressing on a skip
Gate `suppressNextChange` on `!result.reused` in `image.ts`.

---

## Files to touch

**Modified:** `src/main/ipc/imageOps.ts`, `src/main/ipc/image.ts`,
`src/shared/types.ts` (the `reused` field on `CopyImageResult`),
`test/integration/imageOps.integration.test.ts`.

**Shim regen:** **both** projects — `imageOps.ts` is compiled by
`tsconfig.web.json` (for the tests) *and* `tsconfig.node.json` (for the
main process), and `shared/types.ts` spans both. Dev server stopped.

No renderer changes at all: all four call sites already take
`relativePath` from the result and don't care how it got there.

---

## Tests

**`test/integration/imageOps.integration.test.ts`** — real temp dirs, no
`fs` mocking, as the existing file does:

- picking the file already at `assets/hero.png` returns
  `./assets/hero.png` and `reused: true`, and **the assets dir still
  contains exactly one file** — the assertion that actually pins the bug
- the same for nextjs (`public/assets`), since the two formats resolve
  different directories
- a *different* file also named `hero.png` still dedupes to `hero-1.png`
  with `reused: false` — the existing behaviour that must not regress
- importing from outside the project is unchanged, `reused: false`
- a same-named file in `assets/icons/` still copies into the assets root
  (decision 4)
- **the macOS case:** a source path differing only in case from the
  asset. On a case-insensitive filesystem it must be detected as the same
  file; on a case-sensitive one the two really are different files and a
  copy is correct. The test asserts against what the filesystem under it
  actually does rather than hard-coding either answer, so it passes on
  both Linux CI and an APFS dev machine.

Only this spec file gets run — per the standing rule, no directory sweeps.

---

## Open questions

1. **Should the user be told it was reused?** Silently placing the
   existing image is what the story asks for, and I think silence is
   right — the user picked that file, and getting it is not surprising.
   The alternative is a toast ("Using the existing hero.png"), which I'd
   skip unless you've seen people confused about whether the import
   worked. agreed with your rec

2. **`copyImage` will sometimes not copy — rename it?** `importImage`
   would describe it better. The cost is churning the `file:copyImage`
   IPC channel name and four call sites for a naming improvement. I lean
   **leave it**, with the doc comment updated to say it may reuse. Happy
   to rename if you'd rather the name stay honest. agreed

3. **Should a reused import still update `alt`?** `ImageSection`'s
   Replace sets `alt: copied.fileName`, overwriting any alt text the user
   had written. That's existing behaviour and orthogonal to this bug, but
   it's in the same three lines and looks wrong — losing alt text on
   replace is an accessibility regression the user wouldn't notice. Want
   me to fix it here or leave it for its own story? just leave it for now
   
