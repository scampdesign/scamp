# Plan — Projects list card view + per-project card color & state

## Context

The Start Screen (`src/renderer/src/components/StartScreen.tsx`) lists the user's
projects as a **flat vertical list** of `StartScreenProject` rows (name + folder path
only). We want to make it more visual and status-aware:

1. A **card view** (grid of project cards) as the **default**, with a **toggle** to the
   existing **list view**.
2. Cards show the project **name plus the meta we already store** — last opened, format,
   path.
3. A per-project **card background color** and a free-text **state** field (e.g. "in
   progress", "ready to review"), both set from **Project Settings**, so users can manage
   project status visually on the cards.

The card color + state are **per-project** (the user said "from the project settings"), so
they live in `scamp.config.json` (`ProjectConfig`) and travel with the project folder. The
Start Screen reads each project's config to render them.

Design choices flagged for review are marked **[decision]** inline.

---

## Feature A — Data: `cardBackground` + `state` on `ProjectConfig`, surfaced to the list

### A1. Extend `ProjectConfig` (`src/shared/types.ts:151-243`)

Add two **optional** fields (only written when set — keeps `scamp.config.json` minimal and
old files default gracefully):

```ts
/** Background color of this project's card on the Start Screen. */
cardBackground?: string;
/** Free-text status shown as a badge on the card (e.g. "in progress"). */
state?: string;
```

No change to `DEFAULT_PROJECT_CONFIG` (optional ⇒ absent = unset). Cards fall back to a
default color and show no badge when unset.

### A2. Parse them in the forgiving parser (`src/shared/projectConfig.ts:153-209`)

Follow the existing conditional-include pattern (like `canvasHeight` /
`nextjsMigrationDismissed` at lines 201-207). Reuse `isValidColor` (line 16) for the color;
validate `state` as a non-empty string, trimmed and length-capped (e.g. ≤ 40 chars):

```ts
...(isValidColor(cardBackground) ? { cardBackground } : {}),
...(typeof state === 'string' && state.trim() ? { state: state.trim() } : {}),
```

`serializeProjectConfig`, the IPC payload types, `projectConfig.ts` handlers, and preload
need **no change** — they pass the whole `ProjectConfig` through. **Migration is automatic**:
the parser substitutes defaults for older files; `ensureProjectConfig` doesn't rewrite
existing files, so a project gains the fields on its next settings write.

### A3. Surface on the Start Screen data shape

- Extend `StartScreenProject` (`src/shared/types.ts:90-96`) with
  `cardBackground?: string; state?: string`.
- Enrich the list handler `listStartScreenProjects` (`src/main/ipc/recentProjects.ts:94-104`):
  after `mergeProjectsForDisplay`, `Promise.all` over the projects and call
  `readConfig(project.path)` (from `src/main/ipc/projectConfigOps.ts`) to attach
  `cardBackground`/`state`. `readConfig` returns defaults for a missing file and — unlike the
  `ProjectConfigRead` **IPC** wrapper — is **not** behind `assertInsideActiveProject`, so
  it's safe to call for not-yet-open projects. This is one extra round-trip that already does
  per-folder async work (the scan), so cost is negligible.
- Keep the enrichment a small pure helper (e.g. `attachCardMeta(projects, readFn)`) so it's
  unit-testable without disk.

---

## Feature B — Project Settings: card color + state fields

In `ProjectSettingsPage.tsx` (General section), add two rows mirroring the existing
`artboardBackground` wiring (control → `onChange({...config, field})` →
`handleProjectConfigChange` → write-through to `scamp.config.json`):

```tsx
// Card background — reuse the existing ColorInput control.
<ColorInput
  value={config.cardBackground ?? DEFAULT_CARD_BG}
  onChange={(v) => onChange({ ...config, cardBackground: v })}
/>
// State — free text.
<PrefixSuffixInput
  value={config.state ?? ''}
  onCommit={(v) => onChange({ ...config, state: v.trim() || undefined })}
  placeholder="e.g. in progress"
/>
```

- Reuse `ColorInput` and `PrefixSuffixInput` from `src/renderer/src/components/controls/`.
- **[decision]** State is **free text** (per the request). Optional enhancement: offer a few
  suggested presets ("In progress", "Ready to review", "Done") via a datalist/menu while
  still allowing any text. Recommend free-text-first; presets later.
- **[decision]** Keep `artboardBackground` (canvas background) and `cardBackground` as
  **separate** controls with distinct labels so they aren't confused.

---

## Feature C — Start Screen redesign: card view (default) + list toggle

All in `StartScreen.tsx` + `StartScreen.module.css` (pure UI on top of the enriched data).

### C1. View toggle

- Add `viewMode: 'card' | 'list'` (default `'card'`) as local state.
- Render a small toggle in the `<main>` header next to the "Projects" heading — a
  `SegmentedControl` with grid/list Tabler icons (`IconLayoutGrid` / `IconList`), the same
  control used elsewhere in the panel.
- **[decision] Persistence:** remember the choice across launches. Lightest option:
  `localStorage` (renderer-only, no IPC). Alternative for consistency with `defaultFolder`:
  add `viewMode` to the global `Settings` (`getSettings`/`setSettings` IPC). **Recommend
  localStorage** to keep the IPC surface small.

### C2. Card view (default)

- A responsive CSS grid (`grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))`).
- Each card (reuses the existing `handleOpenProjectItem` / remove handlers):
  - **Background:** `config.cardBackground` (fallback `--bg-raised`). Because a user-chosen
    color can be light or dark, compute a **readable text color** from the background's
    luminance (light bg → dark text, dark bg → light text). Reuse the existing color helpers
    (`src/renderer/lib/colorModel.ts` / `controls/colorUtils.ts`) for luminance; add a tiny
    `readableTextColor(bg)` helper (pure, tested). A subtle border keeps cards separated on
    same-colored backgrounds.
  - **Name** (prominent).
  - **State badge** — a pill showing `config.state` when set (styled to read on the card bg).
  - **Meta:** last-opened as relative time (reuse `formatRelativeTime` from
    `src/renderer/store/formatHistoryLabel.ts`), a format badge (`nextjs`/`legacy`), and the
    folder path (muted; full path on hover via `Tooltip`).
  - **Missing/stale** projects: dimmed (`.recentMissing` pattern), open disabled, remove "x"
    shown — same rules as today.
- **[decision]** Card background is the **full card** (per the request). If a full colored
  card reads as too heavy in the dark theme, the fallback is a colored **accent strip**
  (left border / top bar) + neutral card body — note this as an easy alternative if the
  full-bg look is off in review.

### C3. List view (toggle target)

Keep the current list markup (`.recentList` / `.recentItem` / …), optionally augmented with
the same state badge + relative last-opened so both views show the new meta. No behavior
change.

---

## Files at a glance

| File | Change |
|---|---|
| `src/shared/types.ts` | `cardBackground?`/`state?` on `ProjectConfig` + `StartScreenProject` |
| `src/shared/projectConfig.ts` | parse/validate the two new fields (reuse `isValidColor`) |
| `src/main/ipc/recentProjects.ts` | enrich `listStartScreenProjects` via `readConfig(path)` |
| `src/main/ipc/projectListOps.ts` (or new helper) | pure `attachCardMeta` for testability |
| `src/renderer/src/components/ProjectSettingsPage.tsx` (+`.module.css`) | card-color + state rows |
| `src/renderer/src/components/StartScreen.tsx` (+`.module.css`) | view toggle + card grid + list |
| `src/renderer/lib/…` (small helper) | `readableTextColor(bg)` (pure, tested) |

No new IPC channels, no preload changes, no migration table — the forgiving parser and the
whole-object config write handle back-compat.

## Sequencing

1. **Data (A)** — types + parser + list-handler enrichment + tests. Nothing visual yet;
   verify the fields round-trip and reach `StartScreenProject`.
2. **Settings (B)** — the two controls in Project Settings; confirm they persist to
   `scamp.config.json`.
3. **Card view (C)** — the grid, card content, contrast helper, and the list toggle.
4. Polish (badge styling, empty/missing states, relative-time) + verification.

## Verification

- **Unit (required — pure `@lib`/shared logic):** `parseProjectConfig` accepts/round-trips
  `cardBackground`/`state`, rejects invalid colors, trims/caps `state`, and omits them when
  unset (extend `test/projectConfig.test.js`). `attachCardMeta` merges config onto projects.
  `readableTextColor` returns dark-on-light / light-on-dark.
- **Integration:** write a `scamp.config.json` with `cardBackground`/`state` to a temp dir,
  run the list-enrichment read, assert the values surface on `StartScreenProject`.
- **E2E (Playwright):** on the Start Screen the card view is the default and the toggle
  switches to list; setting a card color + state in Project Settings and returning to the
  Start Screen shows the color + state badge on that project's card. (Fixtures: mirror
  `test/e2e/project-view/*`; the settings page is reachable via the existing settings view.)
- **Shim + manual:** these touch `src/renderer/**` and `src/shared/**` → after edits, stop
  `npm run dev`, run `npm run shims` (both web + node, since `src/shared` and `src/main`
  change), restart. Manually: create/open two projects, set different card colors + states,
  confirm the grid renders them, toggle to list and back, and reopen the app to confirm the
  view preference persisted.
```
