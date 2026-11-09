# Custom title bar

The main window is created with `titleBarStyle: 'hidden'` + `titleBarOverlay`
(`src/main/index.ts`) so the OS title bar is replaced by a themed HTML strip
(`src/renderer/src/components/TitleBar.tsx`). This lets the title use the app
font and match the theme — a native title bar can do neither.

## How the pieces fit

- **Main** sizes/paints the overlay: `titleBarOverlay: { ...colors, height }`
  and `trafficLightPosition` for the macOS traffic lights. The initial colors
  come from the persisted theme (`readSettingsSync().theme`) so the window
  controls don't flash the wrong palette before the renderer mounts.
- **Renderer** draws the strip (fixed 36px). It's `position: fixed` at the top
  and drags the window via `-webkit-app-region: drag`; `#root` gets a matching
  `padding-top: 36px` (global.css) so app content sits below it. The Edit
  React Project window also loads global.css but draws its own bar in its
  layout, so `src/renderer/embedded/embedded.css` sets that padding back to 0. The title is
  centered across the full window (short app name; never reaches the controls).

## The bottom-border trick

Electron paints the window-controls overlay as a solid rectangle the full
overlay height, which would cover the bar's bottom border in that corner. So
the overlay height is set to `TITLE_BAR_HEIGHT - 1` (main), 1px shorter than
the HTML bar — leaving the bar's bottom-border row visible continuously,
including beneath the controls. The bar height and `#root` padding are the
full `TITLE_BAR_HEIGHT` (36px), hardcoded in CSS to match the constant.
- **Theme changes** recolor the native controls: `applyAppTheme` calls
  `window.scamp.setTitleBarOverlayColors(...)` → `IPC.WindowSetTitleBarOverlay`
  → `win.setTitleBarOverlay(...)`. Colors live in one place,
  `src/shared/titleBarColors.ts`, shared by main and renderer.

## Platform notes

- **Windows/Linux**: Electron draws min/max/close as a recolorable overlay.
- **macOS**: traffic lights are native and NOT recolorable, so the recolor IPC
  no-ops there (`process.platform === 'darwin'`); the themed HTML strip behind
  them is what makes it match.
- `TITLE_BAR_HEIGHT` (shared constant, 36) is the HTML bar height; the native
  overlay is `TITLE_BAR_HEIGHT - 1`. The CSS hardcodes 36px (`.bar` height and
  `#root` padding-top) to match the constant — keep them in sync.
