# Electron 31 → 44 upgrade — Plan

Status: **implemented** — on 44.1.0. See "What actually happened" at the end.

## Why now

`npm run dev` is blocked on macOS. The dialog is *"Electron has been
blocked because it may reduce your privacy and lower the security of
your Mac. You should move it to the Trash."* The cause:

```
$ spctl -a -vvv -t exec node_modules/electron/dist/Electron.app
Electron.app: notarization indicates this code has been revoked
```

Apple revoked the notarization ticket for the Electron 31.7.7 binary.
Electron's prebuilt binaries are only ad-hoc signed (`Signature=adhoc`,
`TeamIdentifier=not set`, no `_CodeSignature` directory), so every copy
of a given release shares one cdhash — when Apple blocklists it, every
developer's `node_modules` copy is blocked at once. Unlike the ordinary
"unidentified developer" case, macOS offers no **Open Anyway** button in
Privacy & Security for a revocation.

The local copy is genuine: the cached zip hashes to
`e81b75a185376effcc7dd15aef8877ab48474633e5ac7417810a3b28e694bbfa`,
which matches the official `v31.7.7` `SHASUMS256.txt` byte for byte.
Nothing was tampered with locally — this is a blanket revocation of a
long-EOL release, not a compromised download.

**Interim unblock** (does not replace this upgrade): re-signing ad-hoc
changes the cdhash so Gatekeeper stops matching the revoked ticket.

```sh
codesign --force --deep --sign - node_modules/electron/dist/Electron.app
```

Any `npm install`/`npm ci` that re-extracts Electron reverts it.

**The real problem** is that Electron 31 shipped its last release in
January 2025. Electron supports the latest three stable majors; with
44.1.0 current, that window is **42, 43, 44**. Scamp is eleven majors
and roughly two years of Chromium security patches behind.

## Target: 44.1.0

| Electron | Chromium | Node | ABI | Notes |
|---|---|---|---|---|
| 31.7.7 (current) | 126 | 20.18 | 125 | EOL Jan 2025 |
| 38.8.6 | 140 | 22.22 | 139 | EOL |
| 40.10.6 | 144 | 24.15 | 143 | EOL |
| 42.11.0 | 148 | 24.19 | 146 | oldest supported |
| 43.5.0 | 150 | 24.19 | 148 | supported |
| **44.1.0** | **152** | **24.19** | **149** | **latest — target** |

Go straight to 44. Landing on 42 buys one supported major and falls out
of the window as soon as 45 ships (45.0.0-alpha.2 is already published),
and every breaking change between 42 and 44 has to be crossed eventually
anyway. Do it once.

Do **not** target 45 yet — see the watch list at the end.

## What actually breaks in this codebase

The Electron API surface in `src/main` and `src/preload` is narrow and
conservative: `app`, `BrowserWindow`, `ipcMain`, `Menu`, `nativeTheme`,
`net`, `protocol`, `session`, `shell`, `dialog`, `clipboard`,
`safeStorage`, `contextBridge`, `ipcRenderer`. No `BrowserView`, no
`webFrame`, no offscreen rendering. That keeps the blast radius small.

### 1. Clipboard rearchitecture (44) — the one real code change

`src/main/ipc/clipboard.ts` (55 lines) is the only affected file. All
four read/write methods now return Promises, and the narrow helpers
(`readImage`, `readHTML`, `readBuffer`, …) are **removed** in favour of
a W3C-shaped `clipboard.read()` returning `ClipboardItem[]`.

| Current call | Line | Migration |
|---|---|---|
| `clipboard.writeText(args.text)` | 29 | now returns a Promise — `await` it |
| `clipboard.readText()` | 33 | now returns a Promise — `await` it |
| `clipboard.readImage()` | 37 | **removed** — rewrite via `clipboard.read()` |

The `readImage()` path is the substantive one. It currently does
`image.isEmpty()` / `image.toDataURL()` to produce the PNG data URL that
`IPC.ClipboardSaveImage` later parses with
`/^data:image\/png;base64,(.+)$/`. The replacement shape:

```ts
const items = await clipboard.read();
const item = items.find((i) => i.types.some((t) => t.startsWith('image/')));
if (item) {
  const type = item.types.find((t) => t.startsWith('image/'));
  const blob = await item.getType(type);
  const buf = Buffer.from(await blob.arrayBuffer());
  // → data URL, or better: hand the Buffer to saveImageBuffer directly
}
```

Worth considering while in there: the round-trip through a base64 data
URL exists only because `nativeImage.toDataURL()` was the available
shape. `clipboard.read()` yields a Blob, so the buffer could go to
`saveImageBuffer` without the data-URL encode/decode. That is a
behaviour-preserving simplification, but it changes the
`ClipboardSaveImage` IPC payload type in `src/shared/types.ts` — keep it
as a separate follow-up commit so the upgrade itself stays reviewable.

Note the MIME may not be PNG (macOS often offers `image/tiff`). The
existing PNG-only regex would silently reject those; decide explicitly
whether to convert via `sharp` or keep rejecting.

`navigator.clipboard.writeText` in `src/renderer/preview/PreviewToolbar.tsx:78`
is the **W3C** API, not Electron's module, so the "clipboard module
removed from renderers" change in 44 does not touch it.

### 2. Dialogs now default to the Downloads folder (43)

When `defaultPath` is omitted, Electron 43+ explicitly points the dialog
at `~/Downloads` instead of letting the OS restore the last-used
directory. Two call sites omit it:

- `src/main/ipc/project.ts:45` — "Choose project folder"
- `src/main/ipc/htmlExport.ts:34` — "Choose where to put the exported site"

Both are user-visible regressions: picking a project will stop resuming
where the user last was. `export.ts` and `image.ts` already pass
`defaultPath` and are fine. Fix by tracking the last-used directory (the
recent-projects store in `recentProjectsOps.ts` already holds a
reasonable seed for the project picker).

### 3. Native modules — the highest-risk item

`node-pty` must rebuild against ABI 149 / Node 24, and since Electron 33
native modules **require C++20**.

`node-pty`'s newest stable is still **1.1.0** — the version already
pinned. There is a `1.2.0-beta.15` line, which is where newer-Node
support has been landing. Plan for 1.1.0 failing to compile and be ready
to move to the beta; if neither builds, that blocks the upgrade and
needs its own investigation before anything else proceeds.

`sharp` 0.35.3 ships prebuilt platform binaries rather than compiling,
so it is far lower risk, but the `@img/sharp-*` and `asarUnpack` setup in
`electron-builder.yml` must be re-verified in a **packaged** build — per
`docs/archive/2026-08-14-image-import-speed-plan.md` those failures appear only after
packaging.

### 4. Toolchain floor: Node 22+

`@electron/rebuild@4.2.0` declares `engines: { node: ">=22.12.0" }`.
Local Node is **20.20.2** and `.github/workflows/release.yml:38` pins
`node-version: 20`. Both must move — Node 24 LTS is the sensible landing
spot since that is what Electron 44 embeds anyway.

### 5. Install mechanics change (42)

From Electron 42 the npm package **no longer downloads its binary in a
`postinstall` script** — it fetches on first run of the `bin` script
instead (supply-chain hardening, electron RFC #22). Consequences:

- `ELECTRON_SKIP_BINARY_DOWNLOAD` is no longer supported.
- CI cache keys that assumed `node_modules/electron/dist` exists after
  `npm ci` need revisiting in `release.yml`.
- The repo's own `postinstall` (`patch-package && electron-rebuild -f -w
  node-pty`) still works — `electron-rebuild` reads the target version
  from `node_modules/electron/package.json`, which is present regardless
  — but confirm rather than assume.
- `npx install-electron` forces the download explicitly if a CI step
  needs the binary present before `electron-builder` runs.

### 6. Platform floors

Electron 38 drops macOS 11, 44 drops **macOS 12** — Ventura (13) becomes
the minimum. Electron 44 also removes Windows ia32 and Linux armv7l;
`electron-builder.yml` pins no architectures, so nothing to change, but
the macOS floor belongs in release notes and `docs/user_docs`.

### 7. Windows custom-protocol handling (33) — verify only

Chromium's non-special-scheme URL changes broke Windows file paths in
custom protocol URLs. `src/main/index.ts:265` already uses
`protocol.handle` (not the deprecated `registerFileProtocol`), and the
handler decodes via `new URL()`. `protocol.handle` was never affected —
but `scamp-asset://` on Windows carries an absolute path in the
pathname, so exercise it on Windows before release rather than reasoning
about it.

## Checked and confirmed *not* a problem

Worth recording so the next person does not re-derive it:

- **`File.path` removal (32)** — no `File.path` usage anywhere; image
  import goes through `dialog.showOpenDialog` in main, not renderer
  drag-drop of OS files. No `webUtils.getPathForFile` migration needed.
- **`protocol.registerFileProtocol` deprecation** — already on
  `protocol.handle` + `net.fetch`.
- **Sandbox/isolation defaults** — `sandbox: true`,
  `contextIsolation: true`, `nodeIntegration: false` already set on the
  main window (`src/main/index.ts:156-158`).
- **`console-message` argument deprecation (35)** — event unused.
- **`null` session in `ProtocolResponse` (37)** — the handler returns a
  `Response`, never a `ProtocolResponse`.
- **Clipboard removed from renderers (44)** — see §1.
- **`setPreloads`/`getPreloads` deprecation (35)** — not used; preloads
  are set per-window via `webPreferences`.

## Sequence

Each step ends in a working tree that builds. Do not batch them.

0. **Unblock locally** with the ad-hoc re-sign above so `npm run dev`
   works on 31 while the upgrade is in progress, and confirm the
   baseline is green: `npm run test`, `npm run test:e2e`, `npm run
   package`. An upgrade started from an unverified baseline cannot be
   bisected.

1. **Toolchain first, still on Electron 31.** Node 20 → 24 locally and
   in `release.yml`. Bump `@electron/rebuild` to `^4.2.0`,
   `electron-builder` to `^26.15.3`, `@playwright/test` to `^1.62.1`.
   Re-run the full suite. Any failure here is a toolchain problem, not
   an Electron problem — that separation is the point.

2. **Bump `electron` to `^44.0.0` and `electron-vite` to `^5.0.0`.**
   electron-vite 5 peers `vite@^5 || ^6 || ^7`, so move Vite to `^7`
   (not 8 — 8.2.2 is outside that range). Run `npm install` and let the
   native rebuild happen. **Expect this step to fail on `node-pty`.**
   Resolve that before touching any app code; escalate to
   `1.2.0-beta.15` if 1.1.0 will not compile.

3. **Fix the clipboard** (§1). Behaviour-preserving only — no data-URL
   refactor yet.

4. **Fix the dialog `defaultPath` regressions** (§2).

5. **Regenerate the `.js` shims.** Per CLAUDE.md: stop the dev server
   first, then run **both** projects, since these changes span sides:
   `npm run shims`. Skipping the node-side regen leaves the main process
   running the old IPC handlers while the renderer has the new code.

6. **Re-verify the Sentry patch.** `patches/@sentry+electron+7.13.0.patch`
   is a defensive `?? []` against a renderer-killing crash in
   `handleScope`. `@sentry/electron` is now at 7.17.0 — check whether
   the fix landed upstream. If it did, drop the patch and bump. If not,
   the patch must be regenerated for whatever version is installed or
   `patch-package` will fail the `postinstall`.

7. **Full verification** (below), then release notes covering the macOS
   13 floor.

## Verification gates

Unit and integration tests alone are not sufficient here — nothing in
`src/renderer/lib/` touches Electron, so `npm run test` will stay green
through an upgrade that has entirely broken the app.

- `npm run test` — must stay green throughout; it is a regression guard,
  not evidence the upgrade worked.
- `npm run test:e2e` — the real gate. The suite launches the built
  Electron app, and its ~30 spec directories cover clipboard, terminal
  (node-pty), image import, MCP server, and sync.
- **Manual, non-negotiable** — these have no e2e coverage or are
  platform-specific:
  - Paste an image from the OS clipboard onto the canvas (§1), on macOS
    specifically, where the clipboard often offers TIFF rather than PNG.
  - Paste SVG markup onto the canvas.
  - Open the terminal panel and run a command (node-pty ABI).
  - Import a large image (the sharp child-process path).
  - `Cmd+P` preview window, which is `sandbox: false` + `webviewTag: true`.
- `npm run package` on all three platforms, then **run the packaged
  build** — the sharp `asarUnpack` and `scamp-asset://` paths fail only
  after packaging.
- Signing and notarization of the packaged app: this upgrade is
  motivated by a Gatekeeper failure, so confirm the shipped artifact
  passes `spctl -a -t exec` cleanly.

## Rollback

The upgrade touches `package.json`, `package-lock.json`,
`src/main/ipc/clipboard.ts`, `src/main/ipc/project.ts`,
`src/main/ipc/htmlExport.ts`, the shims, and CI config. Keep it on a
branch with one commit per sequence step so a `node-pty` dead end can be
abandoned without unpicking the clipboard work. If it has to be
abandoned entirely, the ad-hoc re-sign from step 0 keeps Electron 31
usable — but that is a holding pattern, not a resting place: it leaves
the app on a Chromium two years stale.

## Watch list — Electron 45

45 is in alpha and should not be targeted, but one change is aimed
squarely at this app's shape:

> **Behavior Changed: `window.open()` children of unsandboxed windows get
> their own sandboxed process**

The preview window (`src/main/previewWindow.ts:125-130`) is deliberately
`sandbox: false` with `webviewTag: true` so it can host the user's
`next dev` app. Re-read `docs/notes/sandbox-tradeoffs.md` against this
change before the 45 upgrade.

Also landing in 45: file descriptors for files inside ASAR archives
become usable only through `fs`, which interacts with the `asarUnpack`
list in `electron-builder.yml`.

## What actually happened

Landed on Electron 44.1.0 across seven commits, one per sequence step.
Three things diverged from the plan:

**`node-abi` needed an override — the one unforeseen blocker.**
`@electron/rebuild` 4.2.0 pins `node-abi` 4.28.0, which predates
Electron 44, so the first `npm install` after the bump died with *"Could
not detect abi for version 44.1.0 and runtime electron"*. Fixed with an
`overrides` entry pinning `node-abi` to `^4.35.0`. Worth remembering:
this will recur on every Electron major until `@electron/rebuild` ships
a matching release, and the error names the wrong culprit.

**`node-pty` was not the problem it was billed as.** The plan called it
the highest risk and expected to fall back to `1.2.0-beta.15`. Stock
1.1.0 compiled cleanly against ABI 149 / Node 24 / C++20 on the first
try. The beta was never needed.

**The Sentry patch could be dropped entirely.** Upstream 7.17.0 carries
the same `(sentScope.breadcrumbs || []).pop()` guard the local patch
added, in both the cjs and esm builds, so `patches/` is now empty and
the dependency moved to `^7.17.0`.

**The Playwright bump orphaned the parity oracle.** The first full e2e
run came back 402 passed / 18 failed, which looked like a serious
Chromium-152 rendering regression. It wasn't: 17 of the 18 were every
parity comparison failing identically with *"No Chromium available for
the parity harness"*. Playwright pins its oracle browser to one revision
per release, so bumping 1.59 -> 1.62 orphaned the downloaded copy.
`npx playwright install chromium` fixed all 17. Written up in
docs/notes/parity-harness.md, since it will recur on the next bump and
the blast radius makes it look like something much worse.

## Open: drag-gesture flakiness under full-suite load

Three full e2e runs on 44 produced 1, 3 and 2 failures out of ~420. Every
failure was a drag gesture that never committed — the drop silently did
nothing, e.g. `expectNestedInTsx` finding the element still unnested —
and **a different subset failed each run**. The same specs pass 110/110
across five consecutive isolated runs.

That rules out a systematic change in pointer-event handling: a real
Chromium 152 behaviour change would reproduce in isolation too. It reads
as load-dependent timing against the 5px `DRAG_ARM_DISTANCE` threshold in
`interactions/constants.ts` — under load Chromium coalesces pending
`pointermove`s more aggressively, and the synthetic `steps: 10` drags in
`dragInFrame` depend on those intermediate events. see
docs/notes/click-vs-drag-slop.md

**What is not known: whether this predates the upgrade.** No e2e baseline
was captured on Electron 31, because the Gatekeeper revocation stopped
the app launching at all — the plan called that out and it cannot be
closed retroactively without reinstalling 31 and ad-hoc re-signing it.

Do not paper over it by turning on Playwright `retries` locally. Either
establish the 31 baseline, or investigate the arming path directly with
a test that drives the gesture under artificial load. Note that CI has
never run e2e — `release.yml` only builds and packages — so this has
never been a release gate either way.

## Verification actually run

- `npm run typecheck` — clean on both projects.
- `npm run test` — 2874 pass, unchanged from the Electron 31 baseline.
- `npm run test:e2e` — 418/420, the two being the drag flakes above.
- `npm run package` — succeeds; `node-pty` rebuilds for arm64 and every
  `asarUnpack` entry lands (`@img`, `sharp`, `node-pty`, `detect-libc`,
  `semver`, `imageOptimizeChild.js`).
- The packaged build launches and stays up.

Two notes on running the packaged build locally. It quits instantly if
an installed Scamp is already running — `requestSingleInstanceLock` is
keyed on the userData dir, so pass `--user-data-dir=<tmp>` to test a
build alongside the installed app rather than quitting the latter.
And local signing is currently skipped because the Developer ID cert in
the keychain reports `CSSMERR_TP_NOT_TRUSTED` (0 valid identities); that
predates this work and only affects local packaging, since CI imports
the cert itself.

**Still unverified — needs a human at the machine.** The clipboard
rewrite is the least covered change in this upgrade: pasting a real
image from the OS clipboard onto the canvas, particularly on macOS where
the clipboard commonly offers `image/tiff` rather than `image/png` and
exercises the NativeImage branch. Also unexercised: pasting SVG markup,
a large image import through the sharp child process, and the Cmd+P
preview window.

Everything else went as written. electron-vite 5 needed no config
changes; the clipboard migration was confined to the four predicted
typecheck errors in `clipboard.ts` and nothing else in the tree; the
dialog `defaultPath` regressions were where the plan said they were.
`spctl` on the 44 binary reports the ordinary ad-hoc rejection ("code
has no resources but signature indicates they must be present") rather
than a revocation, and `npx electron --version` launches — which was the
point of the exercise.
