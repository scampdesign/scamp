# Plan — Light mode for Scamp

## Context

All of Scamp's chrome (toolbars, panels, inputs, dialogs, start screen) is
driven by CSS custom properties declared once in
`src/renderer/src/styles/theme.css` under `:root`. Today those values are a
single **dark** palette. Module CSS reference them as `var(--border)` etc.

We want an **opt-in light mode**: dark stays the default; a toggle in app
Settings switches the whole chrome to a light palette. Per the user: **no
stark white** — the light base is a grey around `#f5f5f5`.

### What the current architecture gives us (and what fights us)

| Piece | File | Relevance |
|---|---|---|
| Chrome token set | `src/renderer/src/styles/theme.css` (`:root`) | The one place to add a light override. Header comment already says these are chrome-only, **not** the user's project tokens. |
| Global element styles | `src/renderer/src/styles/global.css` | Has `color-scheme: dark` (line 34) and a hardcoded scrollbar thumb `rgba(255,255,255,0.12/0.22)` (lines 77/88) — both must become theme-aware. |
| HTML shell (FOUC guard) | `src/renderer/index.html` | Inline `<style>html { background: #1a1a1a; color-scheme: dark; }`. This is the flash-of-dark source for a light-mode user and must be made theme-aware at boot. |
| App settings | `Settings` type (`src/shared/types.ts:107`), `parseSettingsBlob` + `DEFAULT_SETTINGS` (`src/main/ipc/settingsOps.ts`) | `parseSettingsBlob` is the migration/defaulting layer — new `theme` field defaults here. |
| Settings IPC | `getSettings` / `updateSettings` (`src/preload/index.ts:188,193`; channels `SettingsGet`/`SettingsUpdate`) | Reused as-is — **no new IPC needed**. |
| Settings UI | `src/renderer/src/components/SettingsPage.tsx` | Where the toggle lives. Already has a section/row + On/Off button pattern to mirror. |
| Boot | `src/renderer/src/main.tsx` | Imports `theme.css`; good place to apply the persisted theme before first paint. |
| Code editors | `CodePanel.tsx` (×3) + `CssPanel.tsx` (×1) | Hardcode CodeMirror `oneDark`. Won't follow the CSS tokens — needs its own theme swap. |
| Raw literals | ~20 `*.module.css` files carry `#hex`/`rgba()` literals | Any that encode a *light/dark-dependent* color won't flip and will look wrong in light mode. Needs an audit (see slice 5). |

### Decisions locked by the user
- Dark mode stays the **default**.
- Light mode is a **Settings toggle**.
- Light palette uses **no stark white** — grey base ≈ `#f5f5f5`.

### Out of scope (explicit)
- The **user's project canvas** rendering. The canvas shows the user's own
  page using *their* CSS / project `theme.css`, isolated from chrome tokens.
  Light mode must **not** touch it — only Scamp's chrome flips. (We verify
  this, we don't change it.)
- OS-level "auto / follow system" mode. Just an explicit dark|light choice
  for now; `system` can be added later behind the same field.

---

## Slice 1 — Persist the theme preference

**`src/shared/types.ts`** — add to `Settings`:
```ts
/** App chrome theme. Dark is the default; light is opt-in. */
theme: 'dark' | 'light';
```
Export a named type `AppTheme = 'dark' | 'light'` (reused by the renderer helper).

**`src/main/ipc/settingsOps.ts`**:
- `DEFAULT_SETTINGS.theme = 'dark'`.
- In `parseSettingsBlob`, read `obj['theme']` and keep it only if it is
  exactly `'dark'` or `'light'`, else default `'dark'` (old `settings.json`
  with no `theme` key migrates cleanly).

No new IPC — `updateSettings({ theme })` already round-trips a partial.

**Tests** (`test/settingsOps.test.ts`, extend existing): missing `theme` →
`'dark'`; `'light'` kept; unknown/garbage → `'dark'`.

---

## Slice 2 — Apply the theme flash-free at boot

The mechanism is `document.documentElement.dataset.theme = 'light' | 'dark'`;
the light token block (slice 3) keys off `:root[data-theme="light"]`.

**New pure-ish helper `src/renderer/src/lib/appTheme.ts`**:
```ts
export type AppTheme = 'dark' | 'light';
export const THEME_STORAGE_KEY = 'scamp.theme';
export const normalizeTheme = (value: unknown): AppTheme =>
  value === 'light' ? 'light' : 'dark';           // pure, unit-tested
export const readInitialAppTheme = (): AppTheme =>
  normalizeTheme(globalThis.localStorage?.getItem(THEME_STORAGE_KEY));
export const applyAppTheme = (theme: AppTheme): void => {
  document.documentElement.dataset.theme = theme;
  globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme);
};
```
localStorage is a **fast, synchronous mirror** of the setting (same pattern
as the StartScreen `viewMode` I just added). `settings.json` stays the source
of truth; localStorage exists only so boot can paint the right theme with no
IPC round-trip.

**`src/renderer/src/main.tsx`**: call `applyAppTheme(readInitialAppTheme())`
**before** `createRoot(...)`.

**`src/renderer/index.html`**: replace the hardcoded dark inline style with a
tiny inline script that runs before first paint:
```html
<script>
  try {
    var t = localStorage.getItem('scamp.theme') === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    document.documentElement.style.background = t === 'light' ? '#f5f5f5' : '#1a1a1a';
    document.documentElement.style.colorScheme = t;
  } catch (e) {}
</script>
```
This kills the flash even before `main.tsx` loads. (Dark remains the pre-JS
fallback if localStorage is empty or throws.)

**Reconcile on mount**: a small effect in `App.tsx` (or a `useAppTheme` hook)
reads `getSettings()` once and calls `applyAppTheme(settings.theme)` so
`settings.json` wins if localStorage ever drifts (e.g. edited on another
machine / first run after upgrade where localStorage is empty but the setting
is light).

**Tests**: `test/appTheme.test.ts` for `normalizeTheme` (light kept; dark/
unknown/undefined/null → dark). DOM-touching functions verified manually.

---

## Slice 3 — Light token set in `theme.css`

Add a **`:root[data-theme="light"]`** block overriding *every* token. Dark
`:root` is untouched (still the default when no attribute / attribute="dark").

Starter palette (coherent, tunable — grey base, no stark white):

| Token | Dark (current) | Light (proposed) | Note |
|---|---|---|---|
| `--bg-canvas` | `#0f0f0f` | `#e6e6e6` | backdrop behind the page frame — a touch darker than surface so the artboard reads raised |
| `--bg-surface` | `#1a1a1a` | `#f5f5f5` | main surface (user's requested base) |
| `--bg-input` | `#151515` | `#ececec` | inset wells/inputs — slightly darker than surface |
| `--bg-raised` | `#1f1f1f` | `#fbfbfb` | raised buttons/dialogs — brightest, still not pure white |
| `--bg-header` | `#232323` | `#ededed` | top chrome |
| `--bg-hover` | `#2c2c2c` | `#e2e2e2` | hover on raised |
| `--border` | `#2c2c2c` | `#d6d6d6` | workhorse line |
| `--border-subtle` | `#232323` | `#e4e4e4` | quiet divider |
| `--border-strong` | `#3a3a3a` | `#bcbcbc` | prominent edge |
| `--text-primary` | `#e0e0e0` | `#1c1c1c` | body/inputs |
| `--text-secondary` | `#888` | `#5f5f5f` | labels |
| `--text-tertiary` | `#555` | `#8c8c8c` | placeholder/disabled |
| `--text-inverse` | `#fff` | `#fff` | unchanged — text on the blue accent |
| `--accent` | `#4a8cff` | `#2f6fe0` | slightly deeper blue reads better on light |
| `--accent-hover` | `#5a9cff` | `#4a86f0` | |
| `--accent-muted` | `rgba(74,140,255,.2)` | `rgba(47,111,224,.14)` | soft halo |
| `--accent-dark` | `#1d3a6e` | `#d3e2ff` | **semantic flip**: selected-row bg becomes a *light* blue tint so dark text reads on it |
| `--status-error/warn/success` | reds/ambers/greens | keep hues, optionally −1 shade | base status hues read on both |
| `--info-bg/border/text` | dark navy set | `#e7efff` / `#c5d8ff` / `#1e40af` | flip bg↔text lightness |
| `--warn-bg/text` | `#2c2618`/`#f5d199` | `#fdf3d9` / `#8a5a00` | |
| `--error-bg/text` | `#4b1d1d`/`#fca5a5` | `#fdE7E7` / `#b42318` | |
| `--backdrop` | `rgba(0,0,0,.5)` | `rgba(0,0,0,.35)` | lighter modal scrim |
| `--shadow-popover` | `…rgba(0,0,0,.4)` | `…rgba(0,0,0,.12)` | softer on light |
| `--shadow-tooltip` | `…rgba(0,0,0,.2)` | `…rgba(0,0,0,.10)` | |

Geometry/typography tokens are theme-independent — no light override.

**Semantic gotchas to get right (not just literal inversions):**
- `--accent-dark` and the `--info/--warn/--error` **bg↔text** pairs must flip
  *contrast direction*, not just brightness — otherwise light text lands on
  light backgrounds. These are called out above.
- `color-scheme`: today `global.css` and the shell hardcode `dark`. Make it
  `light` under light mode so native form controls / scrollbars follow.

**`global.css`**: token-ize the two theme-dependent literals:
- `color-scheme` → set per theme (via a `:root[data-theme="light"]` rule here
  or a `--color-scheme` token).
- Scrollbar thumb `rgba(255,255,255,0.12/0.22)` → a `--scrollbar-thumb` /
  `--scrollbar-thumb-hover` token (light needs a *dark-on-light* thumb).

---

## Slice 4 — CodeMirror editor theme

`oneDark` is hardcoded (`CodePanel.tsx` ×3, `CssPanel.tsx` ×1) and will stay
dark inside a light app. Swap it based on the active theme:
- dark → `oneDark` (unchanged);
- light → CodeMirror's default (omit the `theme` prop) **or** a small custom
  `EditorView.theme({...})` tuned to our light tokens. Prefer no new dependency
  (CLAUDE.md: don't add deps for ~20 lines).

Thread the current theme to the editors via a lightweight source — a small
Zustand selector or a React context set by the reconcile effect in slice 2 —
rather than prop-drilling. Editors re-mount/reconfigure when it changes
(`CssPanel` already rebuilds extensions on `themeTokens` change — same hook).

---

## Slice 5 — Raw-literal audit (make light *complete*)

Any `#hex` / `rgba()` literal in a `*.module.css` that encodes a
light/dark-dependent color won't flip. Audit and route through tokens:

```bash
grep -rnE "#[0-9a-fA-F]{3,6}|rgba?\(" src/renderer/src --include=*.module.css
```
Known top offenders: `ProjectShell` (9), `SaveStatusIndicator` (8),
`StartScreen` (5 — the `color-mix(currentColor)` ones are fine, they follow
text color), `Controls` (5), `ImageSection` (5), the two migration banners (4
each), `LinkIndicators` (4). For each: if the literal is a
theme-dependent surface/border/text color, replace with an existing token (or
add a semantic token to `theme.css` for both themes). **Theme-agnostic**
overlays — pure-black drop shadows, transparent scrims — can stay, but comment
them so they're not re-flagged.

**Canvas chrome pass**: rulers, selection overlays, snap/grid lines,
`LinkIndicators`, resize handles, and any canvas-drawn UI must stay legible on
the light `--bg-canvas`. Verify (and token-ize) these; they're the easiest
place for a hardcoded dark-on-dark color to disappear on light.

---

## Slice 6 — Settings toggle UI

**`src/renderer/src/components/SettingsPage.tsx`** — add an **Appearance**
section above Privacy:
```tsx
<SegmentedControl<AppTheme>
  value={settings.theme}
  options={[
    { value: 'dark',  label: <IconMoon size={16} stroke={1.75} />,  ariaLabel: 'Dark',  tooltip: 'Dark' },
    { value: 'light', label: <IconSun size={16} stroke={1.75} />,   ariaLabel: 'Light', tooltip: 'Light' },
  ]}
  onChange={handleThemeChange}
/>
```
`handleThemeChange(next)` → `applyAppTheme(next)` (instant flip) then
`updateSettings({ theme: next })` (persist) and `setSettings(...)`. Reuses the
existing `SegmentedControl` (icons from `@tabler/icons-react`). The On/Off
button pattern already in this file is a fine fallback if we prefer text.

---

## Files at a glance

| File | Change | Slice |
|---|---|---|
| `src/shared/types.ts` | `Settings.theme` + `AppTheme` type | 1 |
| `src/main/ipc/settingsOps.ts` | default + parse/migrate `theme` | 1 |
| `test/settingsOps.test.ts` | theme defaulting cases | 1 |
| `src/renderer/src/lib/appTheme.ts` | NEW boot/persist helper | 2 |
| `test/appTheme.test.ts` | NEW `normalizeTheme` tests | 2 |
| `src/renderer/src/main.tsx` | apply theme before render | 2 |
| `src/renderer/index.html` | pre-paint theme script | 2 |
| `src/renderer/src/App.tsx` (or `useAppTheme` hook) | reconcile from settings | 2 |
| `src/renderer/src/styles/theme.css` | `:root[data-theme="light"]` block | 3 |
| `src/renderer/src/styles/global.css` | theme-aware color-scheme + scrollbar | 3 |
| `CodePanel.tsx`, `CssPanel.tsx` (+ theme source) | editor theme swap | 4 |
| ~10–20 `*.module.css` | literal → token | 5 |
| `SettingsPage.tsx` | Appearance toggle | 6 |

No `generateCode` / `parseCode` / store-schema / IPC-channel changes.

## Sequencing

1. **Slices 1 + 2 + 3 (core) + 6** — the minimal end-to-end: field, boot
   apply, light token block, and the toggle. After this the app visibly flips
   (chrome may have a few stragglers from hardcoded literals).
2. **Slice 4** — CodeMirror light theme.
3. **Slice 5** — literal audit + canvas-chrome legibility sweep (this is the
   long tail that makes light mode actually *finished*).
4. Polish + manual verification.

## Verification

- **Unit** (gates `src/renderer/lib` + `src/main/ipc`): `npm run test:unit`
  — `settingsOps` theme defaulting; `appTheme` `normalizeTheme`.
- **Shim regen** (required before in-app testing; these are `.ts`/`.tsx` +
  `src/shared` + `src/main` edits): stop `npm run dev` first, then
  `npm run shims`. Verify dev is down via `ss -ltn | grep :517x`.
- **Manual**: toggle in Settings flips chrome instantly and persists across a
  full relaunch with **no flash**; walk every surface in light — start screen,
  all panels, dialogs, dropdowns/popovers, tooltips, code + CSS editors,
  terminal, banners, canvas rulers/overlays/handles; confirm the **user's
  project canvas rendering is unchanged** (only chrome flipped); flip back to
  dark and confirm it's byte-identical to today.
- **E2E** (optional, later — user runs Playwright manually): a spec that
  toggles the setting, asserts `html[data-theme="light"]`, reloads, and
  asserts the choice survived.

## Open choices (defaults chosen; easy to change)
- Toggle control: **SegmentedControl (Dark/Light, icons)** vs the existing
  On/Off buttons — went with SegmentedControl.
- Light CodeMirror: **CM default (no dep)** vs a custom tuned light theme —
  start with default, upgrade if it clashes.
- The palette table is a **starting point** — every hex is tunable once it's
  on screen.
