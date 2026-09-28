# Auto-update

Scamp ships background auto-updates via **electron-updater**. The feed
baked into the app is the **R2 bucket at `https://updates.scamp.club`**
(the `generic` provider); releases are also published to **GitHub
Releases** (`scampdesign/scamp`) for installs that predate the R2 feed —
see [`update-feed-migration.md`](./update-feed-migration.md) for why
there are two and when the GitHub one goes away. Full product context
and the one-time signing prerequisites live in
`docs/plans/auto-update-prd.md`; this note captures the runtime wiring.

## Flow

```
launch / every 4h
  → autoUpdater.checkForUpdatesAndNotify()   (src/main/updater.ts)
  → update found → downloads silently in the background
  → status events → IPC → renderer UpdateBanner
  → user clicks "Restart and install" → updater:install-now → quitAndInstall()
```

Dismissing the banner does **not** cancel the update —
`autoInstallOnAppQuit` applies it on the next launch.

## Pieces

- `src/main/updater.ts` — `initAutoUpdater(win)`, called once from
  `createWindow`. Guarded by `app.isPackaged`, so it's a no-op in dev
  (there's no release feed to read). Maps electron-updater's
  `UpdateInfo` / `ProgressInfo` down to the minimal `UpdaterInfoPayload`
  / `UpdaterProgressPayload` (in `src/shared/types.ts`) before sending,
  so the renderer never imports main-only types.
- `src/main/ipc/updater.ts` — handles `updater:install-now` →
  `autoUpdater.quitAndInstall()`.
- IPC channel names: `IPC.Updater*` in `src/shared/ipcChannels.ts`.
- Preload (`src/preload/index.ts`): `onUpdaterAvailable` /
  `onUpdaterProgress` / `onUpdaterDownloaded` / `onUpdaterError`
  subscriptions + `installUpdateNow`.
- `src/renderer/src/components/UpdateBanner.tsx` — mounted once in
  `main.tsx` (independent of the active view). Holds the
  downloading / ready / error states locally. The "ready" prompt is
  withheld while the save-status indicator is `saving`, so an update
  never interrupts an in-flight write.

## Build / release

- `electron.vite.config.ts` keeps `electron-updater` + `electron-log`
  **external** — both are CJS with dynamic requires that don't survive
  Rollup bundling; they load from `node_modules` inside the asar.
- `electron-builder.yml` carries the `publish` list — `generic` (R2)
  first, `github` second. electron-builder writes `app-update.yml` into
  the package from the **first entry only**, so the order is
  load-bearing. It also holds the mac hardened runtime / entitlements /
  `notarize: true`. Signing identities are
  **not** hardcoded — mac auto-discovers the Developer ID cert from the
  keychain and win reads `CSC_LINK` / `CSC_KEY_PASSWORD`. Both skip
  cleanly when absent, so unsigned local `npm run package` builds work.
- `.github/workflows/release.yml` runs on `v*` tags: imports certs,
  builds the matrix, publishes to GitHub with `--publish always`, then
  copies each runner's installers, blockmaps, and `latest*.yml` to R2
  with the AWS CLI (installers first, yml last, plus an
  `archive/<version>/` copy). The step fails hard when the `R2_*`
  secrets are missing. A final `verify-feed` job runs
  `scripts/verify-update-feed.mjs` (`npm run verify:feed`) against
  `vars.UPDATE_FEED_URL`.
- The Windows runner is pinned to **`windows-2022`**, not
  `windows-latest`. `windows-latest` migrated to a newer Visual Studio
  that the node-gyp bundled with Node 20 can't detect, so the `node-pty`
  rebuild in `postinstall` fails with "Could not find any Visual Studio
  installation to use". windows-2022 ships VS 2022, which node-gyp finds.
- The Windows cert-import step is gated on the `WIN_CERTS` secret
  (surfaced as a job-level env var because secrets can't be referenced
  in `if:`). With no cert configured the step is skipped and the build
  ships **unsigned** (SmartScreen "unknown publisher") instead of
  failing; it re-enables signing automatically once `WIN_CERTS` is set.

## Gotchas

- macOS auto-update needs the **zip** target (`mac.target` keeps both
  `dmg` and `zip`). A dmg alone can't self-update.
- The CI Windows cert env vars are exported to `GITHUB_ENV` from the
  Windows-only import step, not set globally — otherwise `CSC_LINK`
  would point the macOS/Linux runners at a `certificate.p12` that
  doesn't exist on them and fail the build.
