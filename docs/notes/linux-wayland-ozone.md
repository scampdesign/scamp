# Linux: forcing the X11 ozone backend

## What happens

On Electron 44, Scamp segfaults on Linux when Chromium selects the
**Wayland** ozone backend. The main script runs and `whenReady` fires,
then the process dies with SIGSEGV (exit 139) inside Chromium's
Wayland surface code as the first `BrowserWindow` is created. There is
no stack trace, no error dialog, and no window — the terminal shows
only:

```
ERROR:ui/ozone/platform/wayland/gpu/wayland_surface_factory.cc:249]
'--ozone-platform=wayland' is not compatible with Vulkan.
```

That message is a red herring. Measured on Electron 44.1.0 with a
six-line minimal Electron app (no Scamp code):

| Flags | Result |
|---|---|
| none (defaults to Wayland) | exit 139 |
| `--disable-features=Vulkan` | exit 139 |
| `--disable-gpu` | exit 139 |
| `--use-angle=gl` | exit 139 |
| `ELECTRON_OZONE_PLATFORM_HINT=x11` | exit 139 — the *hint* is ignored |
| `--ozone-platform=x11` | **works** |

Only selecting the X11 backend avoids it, which on a Wayland session
means running through XWayland. It affects `npm run dev`, the E2E
suite, and the packaged AppImage/deb identically — same binary.

Electron 31 (what Scamp shipped before the 44 upgrade) defaulted to
X11 on Linux, which is why this only appeared with the upgrade.

## The flag has to be on the real command line

`app.commandLine.appendSwitch('ozone-platform', 'x11')` **does not
work**, even at module load. Chromium picks its ozone backend before
the main script runs, so by the time any JS executes it is too late.
This was verified on the minimal app, not assumed.

That leaves one mechanism — get the flag onto the process command
line — and three launch paths that each need it differently:

| Path | How it gets the flag |
|---|---|
| Packaged app | `src/main/index.ts` relaunches itself once with the flag appended |
| `npm run dev` | `scripts/dev.mjs` passes it through electron-vite's `--` |
| E2E | `OZONE_ARGS` in `test/e2e/fixtures/launchArgs.ts`, spread into `electron.launch({ args })` |

The relaunch is **packaged-only** (`app.isPackaged`) on purpose:

- Under `npm run dev`, electron-vite exits when the Electron process
  it spawned exits, taking the Vite dev server with it. The relaunched
  app survives but has nothing to load from. Verified.
- Playwright attaches to the process it spawned, so a relaunch would
  detach it and every spec would fail.

The relaunch cannot loop: the relaunched process sees
`--ozone-platform=` in its own argv, so `resolveOzonePlatform` returns
`null` and it starts normally. That argv check is the loop guard —
don't remove it.

The relaunch also runs before `requestSingleInstanceLock()`, so the
throwaway process never takes the lock, and before the Sentry init so
it never opens a session.

## Precedence

`resolveOzonePlatform` in `src/main/ozone.ts` is the single source of
truth (unit tested in `test/ozone.test.ts`). Highest first:

1. An explicit `--ozone-platform` already on argv — return `null`,
   change nothing. Note this must not match `--ozone-platform-hint`.
2. `SCAMP_OZONE_PLATFORM` — used verbatim, except `auto`, which means
   "return `null`, let Electron choose" (i.e. native Wayland again).
3. Default: `x11`.

Non-Linux platforms always get `null`; the switch is meaningless on
macOS and Windows.

`scripts/dev.mjs` repeats these rules rather than importing them:
`ozone.ts` is TypeScript, which a plain `.mjs` script can't import
without a bundler. If the rules change, change both.

## Why an opt-out exists

XWayland costs users on **fractional** scaling (125%, 150%) some
sharpness, because mutter renders at the next integer scale and
downscales. Integer scaling (1x, 2x) is unaffected. Mixed-DPI
multi-monitor also collapses to a single global scale under X11.

`SCAMP_OZONE_PLATFORM=auto` gets the native backend back. Verified to
work end to end — on an affected machine it produces the segfault
again, which is the expected outcome and is documented for users in
`docs/user_docs/linux.md`.

`ELECTRON_OZONE_PLATFORM_HINT` is deliberately **not** the opt-out: it
was tested and Electron 44 ignored it, so honouring it would have
silently reintroduced the segfault for anyone who set it to `x11`.

## If we later drop the workaround

Re-test with the minimal-app repro above. If upstream fixes the
Wayland crash, deleting `src/main/ozone.ts`, the relaunch block in
`src/main/index.ts`, `scripts/dev.mjs`, and `OZONE_ARGS` restores
native Wayland for everyone — but check fractional-scaling rendering
before and after, since that is the user-visible difference.
